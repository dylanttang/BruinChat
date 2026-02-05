import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState } from 'react';

// Change this to your computer's local IP when testing on physical device
// Use your computer's IP address instead of localhost when testing on a physical device
const API_URL = __DEV__ 
  ? 'http://172.26.73.220:3000'  // Your computer's IP (update if it changes)
  : 'http://localhost:3000';      // For web/emulator

export default function App() {
  const [serverStatus, setServerStatus] = useState(null);

  const checkServer = async () => {
    setServerStatus('Connecting...');
    let timeoutId;
    try {
      console.log('Attempting to connect to:', API_URL);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const res = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setServerStatus(`Server OK! Mongo: ${data.mongo || 'unknown'}`);
      console.log('Server response:', data);
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      let errorMsg = 'Unknown error';
      if (err.name === 'AbortError') {
        errorMsg = 'Connection timeout - check firewall/network';
      } else {
        errorMsg = err.message || 'Unknown error';
      }
      setServerStatus(`Error: ${errorMsg}`);
      console.error('Connection error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BruinChat</Text>
      <Text style={styles.subtitle}>UCLA Class Group Chats</Text>

      <TouchableOpacity style={styles.button} onPress={checkServer}>
        <Text style={styles.buttonText}>Test Backend Connection</Text>
      </TouchableOpacity>

      {serverStatus && (
        <Text style={styles.status}>{serverStatus}</Text>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2774AE', // UCLA Blue
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFD100', // UCLA Gold
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#FFD100',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: '#2774AE',
    fontWeight: 'bold',
    fontSize: 16,
  },
  status: {
    marginTop: 20,
    color: '#fff',
    fontSize: 14,
  },
});
