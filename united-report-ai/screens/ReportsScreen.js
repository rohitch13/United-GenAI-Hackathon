import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, query, where, orderBy, limit, getDocs, deleteDoc } from 'firebase/firestore';

const ReportsScreen = ({ navigation, route }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedSort, setSelectedSort] = useState('Date Created');
  const [isSortExpanded, setIsSortExpanded] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState(null);

  // Check if a filter was passed from navigation
  useEffect(() => {
    if (route.params?.filter) {
      setSelectedFilter(route.params.filter);
    }
  }, [route.params?.filter]);

  useEffect(() => {
    // Set up real-time listener for reports
    const reportsRef = collection(db, 'reports');
    // Add a limit to reduce the amount of data being listened to
    const reportsQuery = query(reportsRef, orderBy('created_at', 'desc'), limit(50));
    
    const unsubscribe = onSnapshot(reportsQuery, async (snapshot) => {
      try {
        const reportsData = [];
        
        // Process each report and fetch last message date
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const lastMessageDate = await getLastMessageDate(data.chat_id);
          
          reportsData.push({
            id: doc.id,
            ...data,
            // Use last message date instead of report date
            lastMessageDate: lastMessageDate,
            // Keep original date as fallback
            date: data.date ? 
              (data.date.toDate ? 
                data.date.toDate().toISOString().split('T')[0] : 
                (typeof data.date === 'string' ? data.date : data.date.toString())
              ) : 
              'No date'
          });
        }
        
        // Sort by last message date in JavaScript (most recent first)
        reportsData.sort((a, b) => {
          // Handle yyyy-mm-dd string format
          const dateA = new Date(a.lastMessageDate);
          const dateB = new Date(b.lastMessageDate);
          return dateB - dateA;
        });
        
        setReports(reportsData);
        setLoading(false);
      } catch (error) {
        console.error('Error processing reports data:', error);
        Alert.alert('Error', 'Failed to load reports from database.');
        setLoading(false);
      }
    }, (error) => {
      console.error('Error listening to reports:', error);
      Alert.alert('Error', 'Failed to load reports from database.');
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Function to get the last message date for a chat
  const getLastMessageDate = async (chatId) => {
    try {
      if (!chatId) return 'No chat';
      
      const messagesRef = collection(db, 'report-messages');
      const messagesQuery = query(
        messagesRef, 
        where('chat_id', '==', chatId),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(messagesQuery);
      if (!snapshot.empty) {
        const lastMessage = snapshot.docs[0].data();
        const timestamp = lastMessage.timestamp;
        
        // Handle null or undefined timestamp
        if (!timestamp) {
          return 'No timestamp';
        }
        
        // Handle Firestore Timestamp objects
        if (timestamp.toDate && typeof timestamp.toDate === 'function') {
          return timestamp.toDate().toISOString().split('T')[0];
        }
        
        // Handle Date objects
        if (timestamp instanceof Date) {
          return timestamp.toISOString().split('T')[0];
        }
        
        // Handle string timestamps
        if (typeof timestamp === 'string') {
          return timestamp.split('T')[0];
        }
        
        // Fallback
        return 'Invalid timestamp';
      }
      return 'No messages';
    } catch (error) {
      console.error('Error fetching last message date:', error);
      return 'Error';
    }
  };

  const handleViewReport = (report) => {
    navigation.navigate('PdfPreview', { report });
  };

  const handleSubmitReport = (report) => {
    Alert.alert(
      "Confirm Submission",
      `Are you sure you want to submit the report "${report.title}"? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Submit", 
          onPress: async () => {
            try {
              const currentTime = new Date();
              
              // Update the report status and submitted_at in Firestore
              await updateDoc(doc(db, 'reports', report.id), {
                status: 'Completed',
                submitted_at: currentTime
              });
              
              // Update local state
              setReports(prevReports => 
                prevReports.map(r => 
                  r.id === report.id ? { ...r, status: 'Completed', submitted_at: currentTime } : r
                )
              );
              
              Alert.alert("Success", "Your report has been successfully submitted.");
            } catch (error) {
              console.error('Error submitting report:', error);
              Alert.alert('Error', 'Failed to submit report. Please try again.');
            }
          },
          style: "destructive" 
        }
      ]
    );
  };

  const handleDeleteReport = async (reportId, chatId) => {
    Alert.alert(
      'Delete Report',
      'This will also delete the associated chat and all messages. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete report
              await deleteDoc(doc(db, 'reports', reportId));
              // Delete chat
              await deleteDoc(doc(db, 'report-chats', chatId));
              // Delete messages
              const messagesQuery = query(
                collection(db, 'report-messages'),
                where('chatId', '==', chatId)
              );
              const messagesSnapshot = await getDocs(messagesQuery);
              const batchDeletes = [];
              messagesSnapshot.forEach((msgDoc) => {
                batchDeletes.push(deleteDoc(doc(db, 'report-messages', msgDoc.id)));
              });
              await Promise.all(batchDeletes);
              setOpenMenuId(null);
            } catch (error) {
              Alert.alert('Delete Failed', 'An error occurred while deleting.');
            }
          },
        },
      ]
    );
  };

  const filters = ['All', 'Completed', 'In Progress'];

  const sortOptions = ['Date Created', 'Last Message', 'Status', 'Priority', 'Title'];

  const sortReports = (reportsToSort) => {
    const sortedReports = [...reportsToSort];
    
    switch (selectedSort) {
      case 'Date Created':
        return sortedReports.sort((a, b) => {
          // Handle yyyy-mm-dd string format
          const dateA = new Date(a.lastMessageDate);
          const dateB = new Date(b.lastMessageDate);
          return dateB - dateA;
        });
      
      case 'Last Message':
        return sortedReports.sort((a, b) => {
          const aTime = a.lastMessageDate ? new Date(a.lastMessageDate) : new Date(0);
          const bTime = b.lastMessageDate ? new Date(b.lastMessageDate) : new Date(0);
          return bTime - aTime;
        });
      
      case 'Status':
        return sortedReports.sort((a, b) => {
          const statusOrder = { 'Completed': 1, 'In Progress': 2, 'Pending': 3 };
          return (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
        });
      
      case 'Priority':
        return sortedReports.sort((a, b) => {
          const priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
          return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
        });
      
      case 'Title':
        return sortedReports.sort((a, b) => a.title.localeCompare(b.title));
      
      default:
        return sortedReports;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed':
        return '#4CAF50';
      case 'In Progress':
        return '#FF9800';
      case 'Pending':
        return '#2196F3';
      default:
        return '#757575';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return '#E91E63'; // Pink/Red
      case 'Medium':
        return '#9C27B0'; // Purple
      case 'Low':
        return '#3F51B5'; // Indigo
      default:
        return '#757575';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Lost Baggage':
        return 'briefcase';
      case 'Damaged Baggage':
        return 'warning';
      case 'Damaged Aircraft Infrastructure':
        return 'construct';
      default:
        return 'document';
    }
  };

  const filteredReports = sortReports(reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'All' || report.status === selectedFilter;
    return matchesSearch && matchesFilter;
  }));

  const renderReport = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.reportCard}
        onPress={() => navigation.navigate('Chat', { report: item })}
        activeOpacity={0.9}
      >
        <View style={styles.reportHeader}>
          <View style={styles.reportIcon}>
            <Ionicons name={getTypeIcon(item.type)} size={20} color="#007AFF" />
          </View>
          <View style={styles.reportInfo}>
            <Text style={styles.reportTitle}>{item.title}</Text>
            <Text style={styles.reportDescription} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.reportMeta}>
              <Text style={styles.reportType}>{item.type}</Text>
            </View>
          </View>
          <View style={styles.reportStatus}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}> 
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}> 
              <Text style={styles.priorityText}>{item.priority}</Text>
            </View>
          </View>
        </View>
        <View style={styles.reportFooter}>
          <Text style={styles.reportDate}>{item.lastMessageDate}</Text>
          <View style={styles.actionsContainer}>
            {item.status !== 'Completed' && (
              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={(e) => {
                  e.stopPropagation();
                  handleSubmitReport(item);
                }}
              >
                <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.viewButton} 
              onPress={(e) => {
                e.stopPropagation();
                handleViewReport(item);
              }}
            >
              <Ionicons name="eye-outline" size={18} color="#007AFF" />
              <Text style={styles.viewButtonText}>View PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewButton, { backgroundColor: 'transparent', marginLeft: 6 }]}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteReport(item.id, item.chat_id);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#444" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSubtitle}>{filteredReports.length} reports found</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reports..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={filters}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedFilter === item && styles.filterButtonActive
              ]}
              onPress={() => setSelectedFilter(item)}
            >
              <Text style={[
                styles.filterText,
                selectedFilter === item && styles.filterTextActive
              ]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        />
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <View style={styles.sortHeader}>
          <Text style={styles.sortLabel}>Sort by: {selectedSort}</Text>
          <TouchableOpacity 
            style={styles.sortToggleButton}
            onPress={() => setIsSortExpanded(!isSortExpanded)}
          >
            <Ionicons 
              name={isSortExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color="#007AFF" 
            />
          </TouchableOpacity>
        </View>
        
        {isSortExpanded && (
          <FlatList
            horizontal
            data={sortOptions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  selectedSort === item && styles.sortButtonActive
                ]}
                onPress={() => {
                  setSelectedSort(item);
                  setIsSortExpanded(false); // Collapse after selection
                }}
              >
                <Text style={[
                  styles.sortText,
                  selectedSort === item && styles.sortTextActive
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortList}
          />
        )}
      </View>

      {/* Reports List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReports}
          renderItem={renderReport}
          keyExtractor={(item) => item.id.toString()}
          style={styles.reportsList}
          contentContainerStyle={styles.reportsContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  searchContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterList: {
    paddingHorizontal: 15,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  sortContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  sortToggleButton: {
    padding: 5,
  },
  sortButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
  sortButtonActive: {
    backgroundColor: '#007AFF',
  },
  sortText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  sortTextActive: {
    color: '#fff',
  },
  sortList: {
    paddingHorizontal: 15,
    paddingTop: 5,
  },
  reportsList: {
    flex: 1,
  },
  reportsContent: {
    padding: 15,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reportHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  reportIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  reportMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportType: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  reportStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportDate: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginRight: 4,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf5ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginLeft: 10,
  },
  viewButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 5,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
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

export default ReportsScreen; 