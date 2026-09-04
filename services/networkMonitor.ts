import * as Network from 'expo-network';
import { OfflineStore } from '@/services/offlineStore';
import { probeExamServerReachable } from '@/services/campusWifiGate';

let listenerSubscription: { remove: () => void } | null = null;
let isChecking = false;

/**
 * Evaluates current connectivity and automatically toggles between Online and LAN/Offline Mode.
 *
 * Rules:
 * 1. If Wi-Fi is connected BUT Cloud API is unreachable AND an offline pack exists:
 *    -> AUTOMATICALLY switch to Offline/LAN Mode without requiring app restart.
 * 2. If Cloud API becomes reachable again:
 *    -> AUTOMATICALLY switch back to Online Mode for syncing/downloads.
 */
export async function evaluateAndSwitchNetworkMode(): Promise<boolean> {
  if (isChecking) return false;
  isChecking = true;

  try {
    const netState = await Network.getNetworkStateAsync();
    const isWifi = netState.type === Network.NetworkStateType.WIFI;
    const isConnected = Boolean(netState.isConnected);

    if (!isConnected) {
      if (await OfflineStore.hasPack()) {
        await OfflineStore.setOfflineMode(true);
        if (__DEV__) console.log('[NETWORK MONITOR] No connection -> Switched to AUTOMATIC OFFLINE MODE');
        return true;
      }
      return false;
    }

    if (isWifi) {
      // Wi-Fi connected: probe cloud API with fast 2.5s timeout
      const cloudReachable = await probeExamServerReachable(2500);
      const hasPack = await OfflineStore.hasPack();

      if (!cloudReachable && hasPack) {
        await OfflineStore.setOfflineMode(true);
        if (__DEV__) console.log('[NETWORK MONITOR] Wi-Fi without internet -> Switched to AUTOMATIC LAN/OFFLINE MODE');
        return true;
      } else if (cloudReachable) {
        await OfflineStore.setOfflineMode(false);
        if (__DEV__) console.log('[NETWORK MONITOR] Cloud API reachable -> Switched to AUTOMATIC ONLINE MODE');
        return false;
      }
    } else {
      // Cellular or non-Wi-Fi interface
      const cloudReachable = await probeExamServerReachable(2500);
      if (cloudReachable) {
        await OfflineStore.setOfflineMode(false);
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[NETWORK MONITOR] Evaluation failed:', err);
  } finally {
    isChecking = false;
  }

  return false;
}

export function startNetworkMonitoring(): () => void {
  // Initial evaluation on startup
  void evaluateAndSwitchNetworkMode();

  try {
    if (typeof (Network as any).addNetworkStateListener === 'function') {
      listenerSubscription = (Network as any).addNetworkStateListener(() => {
        void evaluateAndSwitchNetworkMode();
      });
    }
  } catch {
    // ignore
  }

  // Periodic fallback check every 8 seconds
  const interval = setInterval(() => {
    void evaluateAndSwitchNetworkMode();
  }, 8000);

  return () => {
    if (listenerSubscription) {
      try {
        listenerSubscription.remove();
      } catch {}
      listenerSubscription = null;
    }
    clearInterval(interval);
  };
}
