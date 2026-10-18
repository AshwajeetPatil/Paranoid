import React, { useState, useEffect } from 'react';
import { StatusBar, StyleSheet, Alert, AppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initDatabase, runStartupJanitor } from './src/db/database';
import { authenticateBiometrics } from './src/services/biometric';
import BlindCameraScreen from './src/screens/BlindCameraScreen';
import VaultDashboardScreen from './src/screens/VaultDashboardScreen';

export default function App() {
  const [screen, setScreen] = useState<'camera' | 'vault'>('camera');

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await runStartupJanitor();
      } catch (err) {
        console.warn('Startup initialization warning:', err);
      }
    })();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setScreen('camera');
      }
    });
    return () => sub.remove();
  }, []);

  const handleUnlockVault = async () => {
    const ok = await authenticateBiometrics();
    if (ok) {
      setScreen('vault');
    } else {
      Alert.alert(
        'Paranoid Locked',
        'Fingerprint, PIN, or Password authentication is required to view your vault.'
      );
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor="#09090b" />
        {screen === 'camera' ? (
          <BlindCameraScreen onOpenVault={handleUnlockVault} />
        ) : (
          <VaultDashboardScreen onBackToCamera={() => setScreen('camera')} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
});
