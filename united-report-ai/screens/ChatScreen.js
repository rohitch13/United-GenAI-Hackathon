import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Markdown from 'react-native-markdown-display';
import { db, storage } from '../firebase';
import { collection, addDoc, doc, setDoc, query, where, orderBy, getDocs, serverTimestamp, increment, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { callSupervisorAgent, callSupervisorAgentWithText } from '../api';

const ChatScreen = ({ navigation, route }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI assistant for United Airlines. I can help you create reports for customer complaints, service issues, or any airline-related problems. You can upload images and I'll analyze them to help generate comprehensive reports. What type of issue would you like to report today?",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef();

  // Check if we're viewing an existing report
  const existingReport = route.params?.report;

  const reportTypes = [
    // 'Lost Baggage',
    'Damaged Baggage',
    'Damaged Aircraft Infrastructure',
  ];

  // Load existing chat or create new one
  useEffect(() => {
    const initializeChat = async () => {
      if (existingReport && existingReport.chat_id) {
        // Load existing chat
        setChatId(existingReport.chat_id);
        await loadExistingChat(existingReport.chat_id);
      } else {
        // --- Create New Chat ---
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setChatId(newChatId);

        // The default message is already set in the component's initial state.
        // We just need to save this initial message to Firestore for our new chat ID.
        const initialMessage = messages[0];
        if (initialMessage) {
          saveMessageToFirestore(initialMessage, newChatId);
        }
      }
    };

    initializeChat();
  }, [existingReport]);

  const loadExistingChat = async (chatId) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'report-messages'),
        where('chat_id', '==', chatId),
        orderBy('timestamp', 'asc')
      );
      const messagesSnapshot = await getDocs(q);

      const messagesData = messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));

      if (messagesData.length > 0) {
        setMessages(messagesData);
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveMessageToFirestore = async (message, chatIdOverride = null) => {
    const idToUse = chatIdOverride || chatId;
    if (!idToUse) return null;
    
    try {
      // Create a new document reference first to get the ID
      const messageRef = doc(collection(db, 'report-messages'));

      // Save message to report-messages collection
      await setDoc(messageRef, {
        chat_id: idToUse,
        text: message.text,
        sender: message.sender,
        timestamp: serverTimestamp(), // Use server timestamp for ultimate accuracy
        images: message.images || null,
        isOptimistic: message.isOptimistic || false,
      });
      
      // Update/create the chat metadata in report-chats collection
      await setDoc(doc(db, 'report-chats', idToUse), {
        last_message: message.text,
        last_message_time: serverTimestamp(),
        message_count: increment(1),
        created_at: serverTimestamp(),
      }, { merge: true });

      return messageRef; // Return the reference to the new document
      
    } catch (error) {
      console.error('Error saving message to Firestore:', error);
      return null;
    }
  };

  const uploadImageToStorage = async (imageUri) => {
    try {
      // Create a unique filename
      const filename = `report-images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const storageRef = ref(storage, filename);
      
      // Convert image URI to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Upload to Firebase Storage
      const snapshot = await uploadBytes(storageRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image to Storage:', error);
      throw error;
    }
  };

  /**
   * Maps API severity/priority values to the ones used in the app.
   * @param {string} apiPriority The priority from the API ('Severe', etc.).
   * @returns {string} The mapped priority ('High', 'Medium', 'Low').
   */
  const mapApiPriority = (apiPriority) => {
    switch (apiPriority?.toLowerCase()) {
      case 'severe':
      case 'safety critical':
        return 'High';
      case 'moderate':
        return 'Medium';
      default:
        return 'Low';
    }
  };

  /**
   * Processes the response from the supervisor agent to create or update a report.
   * @param {object} apiResponse The JSON response from the supervisor agent.
   */
  const handleApiResponse = async (apiResponse) => {
    if (!apiResponse?.detection_result || !apiResponse?.form_response) {
      throw new Error("Invalid API response structure.");
    }

    const { detection_result, form_response } = apiResponse;
    const generatedForm = JSON.parse(form_response.generated_form || '{}');

    // Create the report data object from the API response
    const reportData = {
      title: detection_result.item || 'Untitled Report',
      description: detection_result.description || 'No description provided.',
      priority: mapApiPriority(detection_result.priority),
      category: generatedForm.issue_type || 'Uncategorized',
      status: 'In Progress',
      type: detection_result.type,
    };

    let reportId = existingReport?.id;
    
    if (reportId) {
      // --- Update Existing Report ---
      console.log(`Updating existing report ID: ${reportId}`);
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, {
        ...reportData,
        updated_at: serverTimestamp(),
      });
    } else {
      // --- Create New Report ---
      console.log("Creating new report...");
      const newReportRef = doc(collection(db, 'reports'));
      reportId = newReportRef.id;
      
      const batch = writeBatch(db);

      // 1. Create the new report
      batch.set(newReportRef, {
        ...reportData,
        chat_id: chatId, // Link report to this chat
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        date: new Date().toISOString().split('T')[0], // Format as yyyy-mm-dd
      });

      // 2. Update the chat document with the new report_id
      const chatRef = doc(db, 'report-chats', chatId);
      batch.set(chatRef, { report_id: reportId }, { merge: true });

      await batch.commit();

      // Update local state to reflect the new report
      navigation.setParams({ report: { id: reportId, ...reportData } });
    }

    // --- Add AI confirmation message to chat ---
    const confirmationText = `I've analyzed the image. ${reportId === existingReport?.id ? 'The report has been updated' : 'A new report has been created'}:
    - **Item:** ${reportData.title}
    - **Priority:** ${reportData.priority}
    - **Description:** ${reportData.description}`;

    const aiMessage = {
      id: Date.now(),
      text: confirmationText,
      sender: 'ai',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, aiMessage]);
    await saveMessageToFirestore(aiMessage);

    // Show success alert for new reports
    if (!existingReport?.id) {
      Alert.alert(
        'Report Created Successfully!',
        `Your report "${reportData.title}" has been created and is now visible in the Dashboard and Reports tab.`,
        [
          {
            text: 'Continue Chatting',
            style: 'cancel'
          },
          {
            text: 'View Report',
            onPress: () => navigation.navigate('PdfPreview', { 
              report: { 
                id: reportId, 
                ...reportData,
                chat_id: chatId,
                date: new Date().toISOString().split('T')[0],
                created_at: new Date(),
                updated_at: new Date()
              } 
            })
          }
        ]
      );
    }
  };
  
  const handleReportTypeSelection = async (reportType) => {
    // 1. Construct the message text that simulates user input
    const messageText = `I want to generate a report for ${reportType}.`;

    // 2. Create the user message object
    const userMessage = {
      id: Date.now(),
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };

    // 3. Add the message to the UI and save it to Firestore
    setMessages(prev => [...prev, userMessage]);
    await saveMessageToFirestore(userMessage);

    // 4. Trigger API call for AI response (same as handleSendMessage)
    setIsTyping(true);
    setTimeout(async () => {
      try {
        const apiResponse = await callSupervisorAgentWithText(messageText);
        console.log("API response for report type selection:", apiResponse);
        
        // Create AI message from API response
        const aiResponse = {
          id: Date.now() + 1,
          text: apiResponse.reply || apiResponse.response || apiResponse.message || "I understand your message. Let me help you with that.",
          sender: 'ai',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Save AI response to Firestore
        await saveMessageToFirestore(aiResponse);
        
        // Log the full API response for debugging
        console.log("Full API response for report type selection:", apiResponse);
        
      } catch (error) {
        console.error("Error calling API for report type selection:", error);
        
        // Fallback to generic response if API fails
        const fallbackResponse = {
          id: Date.now() + 1,
          text: "I understand your concern. Let me help you document this issue properly. Could you provide more details?",
          sender: 'ai',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, fallbackResponse]);
        setIsTyping(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        await saveMessageToFirestore(fallbackResponse);
      }
    }, 1500);
  };

  const handleSendMessage = async () => {
    if (inputText.trim() === '') return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Save user message to Firestore
    await saveMessageToFirestore(userMessage);

    // Call the API for AI response
    setTimeout(async () => {
      try {
        const apiResponse = await callSupervisorAgentWithText(inputText);
        console.log("API response:", apiResponse);
        
        // Create AI message from API response
        const aiResponse = {
          id: Date.now() + 1,
          text: apiResponse.reply || apiResponse.response || apiResponse.message || "I understand your message. Let me help you with that.",
          sender: 'ai',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Save AI response to Firestore
        await saveMessageToFirestore(aiResponse);
        
        // Log the full API response for debugging
        console.log("Full API response for text message:", apiResponse);
        
      } catch (error) {
        console.error("Error calling API for text message:", error);
        
        // Fallback to generic response if API fails
        const fallbackResponse = {
          id: Date.now() + 1,
          text: "I understand your concern. Let me help you document this issue properly. Could you provide more details?",
          sender: 'ai',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, fallbackResponse]);
        setIsTyping(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        await saveMessageToFirestore(fallbackResponse);
      }
    }, 1500);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant permission to access your photo library to upload images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const imageAsset = result.assets[0];
      const localImageUri = imageAsset.uri;

      // --- Step 1: Immediately create and save a placeholder message with image ---
      const optimisticMessageId = `optimistic_${Date.now()}`;
      const placeholderMessage = {
        id: optimisticMessageId,
        text: 'Image uploaded',
        sender: 'user',
        timestamp: new Date(),
        images: [{ uri: localImageUri, width: imageAsset.width, height: imageAsset.height }],
        isOptimistic: true,
      };
      
      setMessages(prev => [...prev, placeholderMessage]);
      // Save placeholder to Firestore immediately to lock in the timestamp
      const placeholderDocRef = await saveMessageToFirestore(placeholderMessage);

      // Show analyzing indicator
      setIsAnalyzingImage(true);

      try {
        // --- Step 2: Background Processing (Parallel) ---
        const [imageUrl, apiResponse] = await Promise.all([
          uploadImageToStorage(localImageUri),
          callSupervisorAgent(localImageUri)
        ]);
        await handleApiResponse(apiResponse);
        
        // --- Step 3: Update the placeholder with final data ---
        const finalMessageData = {
          text: `Image analyzed: ${apiResponse.detection_result.item}`,
          images: [{ uri: imageUrl, width: imageAsset.width, height: imageAsset.height }],
          isOptimistic: false,
        };

        // Update in UI
        setMessages(prev => prev.map(msg => 
          msg.id === optimisticMessageId ? { ...msg, ...finalMessageData } : msg
        ));
        
        // Update in Firestore
        if (placeholderDocRef) {
          await updateDoc(placeholderDocRef, finalMessageData);
        }

      } catch (error) {
        console.error('Full image processing pipeline failed:', error);
        Alert.alert('Analysis Failed', error.message || 'Could not analyze the image. Please try again.');
        // On failure, remove the optimistic message from UI and Firestore
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessageId));
        if (placeholderDocRef) {
          await deleteDoc(placeholderDocRef);
        }
      } finally {
        setIsAnalyzingImage(false);
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please grant permission to access your camera to take photos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const imageAsset = result.assets[0];
      const localImageUri = imageAsset.uri;

      // --- Step 1: Immediately create and save a placeholder message with image ---
      const optimisticMessageId = `optimistic_${Date.now()}`;
      const placeholderMessage = {
        id: optimisticMessageId,
        text: 'Photo captured',
        sender: 'user',
        timestamp: new Date(),
        images: [{ uri: localImageUri, width: imageAsset.width, height: imageAsset.height }],
        isOptimistic: true,
      };

      setMessages(prev => [...prev, placeholderMessage]);
      const placeholderDocRef = await saveMessageToFirestore(placeholderMessage);

      // Show analyzing indicator
      setIsAnalyzingImage(true);

      try {
        // --- Step 2: Background Processing (Parallel) ---
        const [imageUrl, apiResponse] = await Promise.all([
          uploadImageToStorage(localImageUri),
          callSupervisorAgent(localImageUri)
        ]);
        await handleApiResponse(apiResponse);
        
        // --- Step 3: Update the placeholder with final data ---
        const finalMessageData = {
          text: `Image analyzed: ${apiResponse.detection_result.item}`,
          images: [{ uri: imageUrl, width: imageAsset.width, height: imageAsset.height }],
          isOptimistic: false,
        };

        // Update in UI
        setMessages(prev => prev.map(msg => 
          msg.id === optimisticMessageId ? { ...msg, ...finalMessageData } : msg
        ));
        
        // Update in Firestore
        if (placeholderDocRef) {
          await updateDoc(placeholderDocRef, finalMessageData);
        }

      } catch (error) {
        console.error('Full image processing pipeline failed:', error);
        Alert.alert('Analysis Failed', error.message || 'Could not analyze the image. Please try again.');
        // On failure, remove the optimistic message from UI and Firestore
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessageId));
        if (placeholderDocRef) {
          await deleteDoc(placeholderDocRef);
        }
      } finally {
        setIsAnalyzingImage(false);
      }
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageContainer,
      item.sender === 'user' ? styles.userMessage : styles.aiMessage
    ]}>
      <View style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.aiBubble
      ]}>
        <Markdown style={{ 
            body: { color: item.sender === 'user' ? '#fff' : '#333' },
            strong: { fontWeight: 'bold' } 
          }}>
          {item.text}
        </Markdown>
        
        {item.images && (
          <View style={styles.imageContainer}>
            {item.images.map((image, index) => (
              <Image
                key={index}
                source={{ uri: image.uri }}
                style={[styles.messageImage, item.isOptimistic && { opacity: 0.6 }]}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {existingReport ? existingReport.title : 'New Report'}
        </Text>
      </View>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Report Type Selection */}
        {(!existingReport || existingReport.status !== 'Completed') && (
          <View style={styles.reportTypeContainer}>
            <Text style={styles.reportTypeTitle}>Report Type:</Text>
            <FlatList
              horizontal
              data={reportTypes}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.reportTypeButton}
                  onPress={() => handleReportTypeSelection(item)}
                >
                  <Text style={styles.reportTypeText}>{item}</Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reportTypeList}
            />
          </View>
        )}

        {/* Chat Messages */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading chat...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id.toString()}
            style={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            onLayout={() => flatListRef.current?.scrollToEnd()}
          />
        )}

        {/* Typing Indicator */}
        {(isTyping || isAnalyzingImage) && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>
              {isAnalyzingImage ? 'Uploading and analyzing image...' : 'AI is typing...'}
            </Text>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
              <Ionicons name="image" size={24} color="#007AFF" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color="#007AFF" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your message..."
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity 
              style={[styles.sendButton, inputText.trim() === '' && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={inputText.trim() === ''}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 15,
  },
  reportTypeContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  reportTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  reportTypeList: {
    paddingHorizontal: 5,
  },
  reportTypeButton: {
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  reportTypeText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  messagesList: {
    flex: 1,
    padding: 15,
  },
  messageContainer: {
    marginBottom: 15,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  aiMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#007AFF',
  },
  aiBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  aiText: {
    color: '#333',
  },
  imageContainer: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  messageImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 5,
    marginBottom: 5,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  typingContainer: {
    padding: 15,
    alignItems: 'flex-start',
  },
  typingText: {
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  attachButton: {
    padding: 8,
    marginRight: 5,
  },
  cameraButton: {
    padding: 8,
    marginRight: 5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 10,
  },
});

export default ChatScreen; 