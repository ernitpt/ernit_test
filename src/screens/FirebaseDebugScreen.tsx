import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { firebaseDebugger } from '../utils/FirebaseDebugger';
import { auth } from '../services/firebase';
import { logger } from '../utils/logger';

const FirebaseDebugScreen: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);
    
    // Override logger.log to capture results
    const originalLog = logger.log;
    const originalError = logger.error;
    
    logger.log = (...args) => {
      addResult(args.join(' '));
      originalLog(...args);
    };
    
    logger.error = (...args) => {
      addResult(`ERROR: ${args.join(' ')}`);
      originalError(...args);
    };

    try {
      await firebaseDebugger.runAllTests();
    } catch (error) {
      addResult(`CRITICAL ERROR: ${error.message}`);
    } finally {
      // Restore original console methods
      logger.log = originalLog;
      logger.error = originalError;
      setIsRunning(false);
    }
  };

  const checkAuth = () => {
    const isAuthenticated = firebaseDebugger.checkAuth();
    Alert.alert(
      'Authentication Status',
      isAuthenticated 
        ? `✅ Authenticated\nUser ID: ${auth.currentUser?.uid}\nEmail: ${auth.currentUser?.email}`
        : '❌ Not authenticated'
    );
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Firebase Debug Console</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={runTests}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>
            {isRunning ? 'Running Tests...' : 'Run All Tests'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={checkAuth}
        >
          <Text style={styles.buttonText}>Check Auth</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.clearButton]}
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.resultsContainer}>
        {results.map((result, index) => (
          <Text key={index} style={styles.resultText}>
            {result}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Instructions:</Text>
        <Text style={styles.instructionText}>
          1. Make sure you're signed in to the app{'\n'}
          2. Click "Run All Tests" to check Firebase access{'\n'}
          3. If you see permission errors, update Firestore rules{'\n'}
          4. Go to Firebase Console → Firestore Database → Rules{'\n'}
          5. Replace with rules from firestore.rules file
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
    minWidth: 100,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  resultText: {
    color: '#00FF00',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  instructions: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

export default FirebaseDebugScreen;
