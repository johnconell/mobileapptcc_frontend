import { useCallback, useEffect, useRef, useState } from 'react';
import { isWifiConnected } from '@/features/monitoring/services/campusWifiGate';
import * as Network from 'expo-network';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';

export type WifiDisconnectReason = 'wifi_lost' | 'proctor_network_change';

type WifiGateOptions = {
  enabled: boolean;
  onDisconnect?: (reason: WifiDisconnectReason) => void;
};

/**
 * Campus anti-cheat: exam requires any Wi‑Fi connection.
 * Turning Wi‑Fi off (or leaving Wi‑Fi) locks the exam until reconnect succeeds.
 * Includes a 30-second grace period before a hard Reconnect PIN is required.
 *
 * When Wi‑Fi is up but the proctor peer is unreachable, we first refresh the
 * host IP from the cloud (proctor may have changed networks) before locking.
 * Proctor-side network changes do not count as examinee anti-cheat violations.
 */
export function useWifiExamGate({ enabled, onDisconnect }: WifiGateOptions) {
  const [wifiLocked, setWifiLocked] = useState(false);
  const [requiresPin, setRequiresPin] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(true);
  const [disconnectReason, setDisconnectReason] = useState<WifiDisconnectReason | null>(null);
  const wasConnected = useRef(true);
  const disconnectStartTime = useRef<number | null>(null);

  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const checkWifi = useCallback(async (): Promise<boolean> => {
    const ok = await isWifiConnected();
    setWifiConnected(ok);
    return ok;
  }, []);

  const unlockAfterReconnect = useCallback(async () => {
    const ok = await checkWifi();
    if (!ok) {
      setWifiLocked(true);
      return false;
    }

    if (await PeerExamClient.isActive()) {
      await PeerExamClient.refreshHostFromCloud();
      const reachable = await PeerExamClient.ping();
      if (!reachable) {
        setWifiLocked(true);
        setDisconnectReason('proctor_network_change');
        return false;
      }
    }

    if (!requiresPin) {
      setWifiLocked(false);
      setDisconnectReason(null);
      wasConnected.current = true;
      disconnectStartTime.current = null;
      return true;
    }

    return false;
  }, [checkWifi, requiresPin]);

  useEffect(() => {
    if (!enabled) {
      setWifiLocked(false);
      setRequiresPin(false);
      setDisconnectReason(null);
      wasConnected.current = true;
      disconnectStartTime.current = null;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const netState = await Network.getNetworkStateAsync();
      const isWifi = netState.type === Network.NetworkStateType.WIFI;

      const isPeer = await PeerExamClient.isActive();
      let serverReachable = true;
      let reason: WifiDisconnectReason = 'wifi_lost';

      if (!isWifi) {
        serverReachable = false;
        reason = 'wifi_lost';
      } else if (isPeer) {
        serverReachable = await PeerExamClient.ping();
        if (!serverReachable) {
          // Proctor may have moved Wi‑Fi / got a new DHCP lease — refresh cloud IP once.
          const refreshed = await PeerExamClient.refreshHostFromCloud();
          if (refreshed) {
            serverReachable = await PeerExamClient.ping();
          }
          if (!serverReachable) {
            reason = 'proctor_network_change';
          }
        }
      }

      if (cancelled) return;

      const connectionOk = isWifi && serverReachable;

      if (!connectionOk) {
        setWifiLocked(true);
        setDisconnectReason(reason);
        if (!disconnectStartTime.current) {
          disconnectStartTime.current = Date.now();
        }

        const elapsed = (Date.now() - disconnectStartTime.current) / 1000;
        // Proctor network change: never escalate to PIN — examinee is not at fault.
        if (reason === 'wifi_lost' && elapsed > 30) {
          setRequiresPin(true);
        }

        if (wasConnected.current) {
          wasConnected.current = false;
          onDisconnectRef.current?.(reason);
        }
      } else {
        if (!requiresPin) {
          setWifiLocked(false);
          setDisconnectReason(null);
          wasConnected.current = true;
          disconnectStartTime.current = null;
        }
      }
    };

    void tick();
    const id = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, requiresPin]);

  return {
    wifiLocked,
    requiresPin,
    wifiConnected,
    disconnectReason,
    unlockAfterReconnect,
    setWifiLocked,
    setRequiresPin,
  };
}
