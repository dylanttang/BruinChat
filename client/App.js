import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState } from 'react';

// Change this to your computer's local IP when testing on physical device
const API_URL = 'http://localhost:3000';

export default function App() {
  const [serverStatus, setServerStatus] = useState(null);

  const checkServer = async () => {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      const data = await res.json();
      setServerStatus(`Server OK at ${data.timestamp}`);
    } catch (err) {
      setServerStatus('Server not reachable');
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
