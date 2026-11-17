import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';

export const EXAM_WIFI_JOIN_MESSAGE = 'Connect to the exam WiFi to join.';
export const EXAM_WIFI_RECONNECT_MESSAGE =
  'Not connected to the exam WiFi. Reconnecting...';

let operation: Promise<void> = Promise.resolve();
let bindingHeld = false;

function queue(operationToRun: () => Promise<void>): Promise<void> {
  const next = operation.then(operationToRun, operationToRun);
  operation = next.catch(() => undefined);
  return next;
}

function isConnectedToWifi(state: NetInfoState | null | undefined): boolean {
  return state?.type === 'wifi' && state.isConnected === true;
}

export async function getExamineeWifiState(): Promise<{
  isWifi: boolean;
  isConnected: boolean;
}> {
  try {
    const state = await NetInfo.fetch();
    return {
      isWifi: isConnectedToWifi(state),
      isConnected: state.isConnected === true,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[EXAM WIFI] Could not read network state:', error);
    }
    return { isWifi: false, isConnected: false };
  }
}

/**
 * Pins this app's Android traffic to the currently connected Wi-Fi network.
 * The operation is deliberately best-effort: native failures are logged and
 * never prevent the examinee from continuing through the join flow.
 */
export function retainExamineeWifiUsage(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();

  return queue(async () => {
    if (bindingHeld) return;
    try {
      const WifiManager = (await import('react-native-wifi-reborn')).default;
      await WifiManager.forceWifiUsage(true);
      bindingHeld = true;
      if (__DEV__) console.info('[EXAM WIFI] App traffic bound to Wi-Fi.');
    } catch (error) {
      console.warn('[EXAM WIFI] Could not bind app traffic to Wi-Fi:', error);
    }
  });
}

/** Release the app-wide Android Wi-Fi route after the examinee flow ends. */
export function releaseExamineeWifiUsage(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();

  return queue(async () => {
    try {
      const WifiManager = (await import('react-native-wifi-reborn')).default;
      await WifiManager.forceWifiUsage(false);
      bindingHeld = false;
      if (__DEV__) console.info('[EXAM WIFI] App traffic released from Wi-Fi.');
    } catch (error) {
      console.warn('[EXAM WIFI] Could not release Wi-Fi binding:', error);
    }
  });
}

export function subscribeExamineeWifi(
  listener: (isWifi: boolean) => void,
): () => void {
  const subscription = NetInfo.addEventListener((state) => {
    listener(isConnectedToWifi(state));
  });
  return () => subscription();
}

