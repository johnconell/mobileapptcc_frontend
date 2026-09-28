import * as Network from 'expo-network';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';

let listenerSubscription: { remove: () => void } | null = null;
let isChecking = false;

/**
 * Change modes from the OS network signal only; never probe the cloud here.
 * A running local exam must not change mode when internet reachability changes.
 */
export async function evaluateAndSwitchNetworkMode(): Promise<boolean> {
  if (isChecking) return false;
  isChecking = true;

  try {
    const netState = await Network.getNetworkStateAsync();
    const isWifi = netState.type === Network.NetworkStateType.WIFI;
    const isConnected = netState.isConnected === true;

    const { PeerExamClient } = await import('@/features/examinations/services/peerExamClient');
    if (await PeerExamClient.isActive()) {
      // Examinee is bound to the proctor phone. Cloud outage must not disable LAN polls.
      return false;
    }

    if (PeerExamServer.info().running) return false;

    if (!isConnected || (isWifi && netState.isInternetReachable === false)) {
      if (await OfflineStore.hasPack()) await OfflineStore.setOfflineMode(true);
      return true;
    }

    if (netState.isInternetReachable === true) await OfflineStore.setOfflineMode(false);
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

  // Periodic fallback check for devices without network-state events
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
