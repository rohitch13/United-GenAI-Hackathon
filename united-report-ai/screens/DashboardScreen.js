import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

const DashboardScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [recentReports, setRecentReports] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
  });

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

  useEffect(() => {
    // Set up real-time listener for reports
    const reportsRef = collection(db, 'reports');
    // Add a limit to reduce the amount of data being listened to
    const reportsQuery = query(reportsRef, orderBy('created_at', 'desc'), limit(20));
    
    const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
      try {
        const reportsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Convert Firebase Timestamp to readable date string or use existing date string
            date: data.date ? 
              (data.date.toDate ? 
                data.date.toDate().toISOString().split('T')[0] : 
                (typeof data.date === 'string' ? data.date : data.date.toString())
              ) : 
              'No date'
          };
        });

        // Sort by date in JavaScript (most recent first)
        reportsData.sort((a, b) => {
          // Handle yyyy-mm-dd string format
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA;
        });

        // Calculate stats
        const total = reportsData.length;
        const completed = reportsData.filter(report => report.status === 'Completed').length;
        const inProgress = reportsData.filter(report => report.status === 'In Progress').length;

        setStats({ total, completed, inProgress });
        
        // Get recent reports (last 3)
        const recent = reportsData.slice(0, 3);
        setRecentReports(recent);
        
        setLoading(false);
      } catch (error) {
        console.error('Error processing reports data:', error);
        setLoading(false);
      }
    }, (error) => {
      console.error('Error listening to reports:', error);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>United Airlines AI</Text>
          <Text style={styles.headerSubtitle}>Report Management System</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <TouchableOpacity 
            style={[styles.statCard, stats.total === 0 && styles.statCardDisabled]}
            onPress={() => {
              if (stats.total !== 0) {
                navigation.navigate('Reports', { filter: 'All' });
              }
            }}
            disabled={stats.total === 0}
          >
            <Ionicons name="document-text" size={24} color="#007AFF" />
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statCard, stats.completed === 0 && styles.statCardDisabled]}
            onPress={() => {
              if (stats.completed !== 0) {
                navigation.navigate('Reports', { filter: 'Completed' });
              }
            }}
            disabled={stats.completed === 0}
          >
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.statNumber}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statCard, stats.inProgress === 0 && styles.statCardDisabled]}
            onPress={() => {
              if (stats.inProgress !== 0) {
                navigation.navigate('Reports', { filter: 'In Progress' });
              }
            }}
            disabled={stats.inProgress === 0}
          >
            <Ionicons name="time" size={24} color="#FF9800" />
            <Text style={styles.statNumber}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </TouchableOpacity>
        </View>

        {/* Create New Report Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('Chat')}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.createButtonText}>Create New Report</Text>
        </TouchableOpacity>

        {/* Recent Reports */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Reports</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Loading reports...</Text>
            </View>
          ) : (
            recentReports.map((report) => (
              <TouchableOpacity 
                key={report.id} 
                style={styles.reportCard}
                onPress={() => navigation.navigate('Chat', { report: report })}
              >
                <View style={styles.reportHeader}>
                  <View style={styles.reportIcon}>
                    <Ionicons name={getTypeIcon(report.type)} size={20} color="#007AFF" />
                  </View>
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportTitle}>{report.title}</Text>
                    <Text style={styles.reportType}>{report.type}</Text>
                  </View>
                  <View style={styles.reportStatus}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(report.status) }]}>
                      <Text style={styles.statusText}>{report.status}</Text>
                    </View>
                    <Text style={styles.reportDate}>{report.date}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
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
  statsContainer: {
    flexDirection: 'row',
    padding: 20,
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statCardDisabled: {
    backgroundColor: '#ccc',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  createButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  reportCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2.22,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  reportType: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
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
  reportDate: {
    fontSize: 12,
    color: '#999',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
});

export default DashboardScreen; 