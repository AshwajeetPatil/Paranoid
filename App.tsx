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
      await initDatabase();
      await runStartupJanitor();
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
      Alert.alert('Vault Locked', 'Fingerprint or PIN authentication is required to view Kosh.');
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