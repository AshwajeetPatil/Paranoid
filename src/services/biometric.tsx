import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateBiometrics(): Promise<boolean> {
  try {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();

    // If the phone has NO lock screen security at all (no PIN, pattern, or fingerprint)
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      return true;
    }

    // Prompts Fingerprint/Face unlock, or falls back to System PIN/Password/Pattern
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Paranoid Vault',
      fallbackLabel: 'Use PIN / Password',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch (error) {
    console.warn('Authentication error:', error);
    return false;
  }
}

export const authenticateVault = authenticateBiometrics;
