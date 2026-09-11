import { Platform } from 'react-native';

/**
 * Loopback hosts only work on the same machine (Expo web / iOS simulator).
 * On a physical phone, 127.0.0.1 is the phone — never the exam PC.
 */
export function isLoopbackApiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0'
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/** True when this build is running on a physical (or Emulator that needs LAN) device. */
export function requiresLanApiHost(): boolean {
  // Web on the PC can use 127.0.0.1. Native apps generally cannot.
  if (Platform.OS === 'web') return false;
  return true;
}

export function describeApiReachabilityProblem(apiBaseUrl: string): string | null {
  if (!requiresLanApiHost()) return null;
  if (!isLoopbackApiHost(apiBaseUrl)) return null;

  return (
    'This phone cannot use 127.0.0.1 (that address is the phone itself). ' +
    'Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CLOUD_API_URL to your computer’s Wi‑Fi IP ' +
    '(ipconfig), e.g. http://10.x.x.x:8000/api/v1. Phone and PC must share the same Wi‑Fi. ' +
    'Then restart Expo with: npx expo start -c'
  );
}

/** Student-facing message (no artisan / .env jargon). */
export function studentPackDownloadFailureMessage(
  apiBaseUrl: string,
  technical?: string,
): string {
  const loopback = describeApiReachabilityProblem(apiBaseUrl);
  if (loopback) {
    return (
      'Cannot download exam data on this phone.\n\n' +
      'Your app is pointing at the wrong server address (localhost). ' +
      'Ask the proctor/admin to set the computer Wi‑Fi IP in the app config and rebuild/restart.\n\n' +
      'Until then, join school Wi‑Fi with a correctly configured app so the exam pack can download once.'
    );
  }

  const host = (() => {
    try {
      return new URL(apiBaseUrl).host;
    } catch {
      return apiBaseUrl;
    }
  })();

  return (
    'Wi‑Fi / LAN does not match the proctor exam network.\n\n' +
    `This phone cannot reach the exam server (${host}).\n\n` +
    '1. Connect to the SAME Wi‑Fi as the proctor / exam computer.\n' +
    '2. Ask the proctor to confirm the exam server is running.\n' +
    '3. Try again.\n\n' +
    (technical ? `Details: ${technical}` : '')
  );
}
