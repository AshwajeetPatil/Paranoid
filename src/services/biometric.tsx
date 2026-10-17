import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateBiometrics(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    // If running on an emulator or a phone without a screen lock configured, allow entry
    if (!hasHardware || !isEnrolled) {
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Kosh Private Vault',
      fallbackLabel: 'Use Phone PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}