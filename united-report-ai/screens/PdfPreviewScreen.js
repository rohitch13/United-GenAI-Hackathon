import React, { useLayoutEffect, useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const PdfPreviewScreen = ({ route, navigation }) => {
  const { report } = route.params;
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch chat messages for this report
  useEffect(() => {
    const fetchChatMessages = async () => {
      if (!report.chat_id) {
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'report-messages'),
          where('chat_id', '==', report.chat_id),
          orderBy('timestamp', 'asc')
        );
        const messagesSnapshot = await getDocs(q);

        const messagesData = messagesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date(),
        }));

        setChatMessages(messagesData);
      } catch (error) {
        console.error('Error loading chat messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChatMessages();
  }, [report.chat_id]);

  const generateHtmlContent = () => {
    // Extract all images from chat messages
    const allImages = [];
    chatMessages.forEach(message => {
      if (message.images && message.images.length > 0) {
        message.images.forEach(image => {
          allImages.push({
            uri: image.uri,
            timestamp: message.timestamp,
            sender: message.sender
          });
        });
      }
    });

    // Generate images HTML
    const imagesHtml = allImages.length > 0 ? `
      <div style="margin-top: 30px;">
        <h2>Report Images (${allImages.length})</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;">
          ${allImages.map((image, index) => `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 10px; background-color: #f9f9f9;">
              <img src="${image.uri}" 
                   style="max-width: 250px; max-height: 200px; border-radius: 4px;" 
                   alt="Report Image ${index + 1}" />
              <div style="margin-top: 8px; font-size: 12px; color: #666;">
                <div>Uploaded by: ${image.sender === 'user' ? 'User' : 'AI Assistant'}</div>
                <div>Time: ${image.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; }
            h1 { color: #007AFF; border-bottom: 2px solid #007AFF; padding-bottom: 10px; font-size: 24px; }
            h2 { font-size: 18px; color: #333; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; font-size: 14px; }
            th { background-color: #f2f2f2; }
            .label { font-weight: bold; color: #555; }
          </style>
        </head>
        <body>
          <h1>United Airlines Report</h1>
          <h2>Report ID: ${report.id}</h2>
          
          <table>
            <tr>
              <td class="label">Title</td>
              <td>${report.title}</td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td>${report.date}</td>
            </tr>
            <tr>
              <td class="label">Status</td>
              <td>${report.status}</td>
            </tr>
             <tr>
              <td class="label">Priority</td>
              <td>${report.priority}</td>
            </tr>
            <tr>
              <td class="label">Report Type</td>
              <td>${report.type}</td>
            </tr>
            <tr>
              <td class="label">Description</td>
              <td>${report.description}</td>
            </tr>
            ${report.submitted_at ? `
            <tr>
              <td class="label">Submitted At</td>
              <td>${new Date(report.submitted_at).toLocaleString()}</td>
            </tr>
            ` : ''}
          </table>

          ${imagesHtml}
        </body>
      </html>
    `;
  };

  const htmlContent = generateHtmlContent();

  const generateAndSharePdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Download Report PDF' });
    } catch (error) {
      console.error('Failed to generate or share PDF:', error);
      Alert.alert('Error', 'Could not generate or share the PDF.');
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Report Preview',
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading report data...</Text>
        </View>
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webview}
        />
      )}
      <TouchableOpacity onPress={generateAndSharePdf} style={styles.downloadFab}>
        <Ionicons name="download-outline" size={24} color="#fff" />
        <Text style={styles.downloadFabText}>Download PDF</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  downloadFab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  downloadFabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
  },
});

export default PdfPreviewScreen; 