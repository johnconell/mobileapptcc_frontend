import { useCallback, useEffect, useRef, useState } from 'react';
import { isWifiConnected } from '@/services/campusWifiGate';
import * as Network from 'expo-network';
import { PeerExamClient } from '@/services/peerExamClient';

type WifiGateOptions = {
  enabled: boolean;
  onDisconnect?: () => void;
};

/**
 * Campus anti-cheat: exam requires any Wi‑Fi connection.
 * Turning Wi‑Fi off (or leaving Wi‑Fi) locks the exam until reconnect succeeds.
 * Includes a 30-second grace period before a hard Reconnect PIN is required.
 */
export function useWifiExamGate({ enabled, onDisconnect }: WifiGateOptions) {
  const [wifiLocked, setWifiLocked] = useState(false);
  const [requiresPin, setRequiresPin] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(true);
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

    // If they re-established connection within the 30s grace period,
    // they don't need a PIN.
    if (!requiresPin) {
        setWifiLocked(false);
        wasConnected.current = true;
        disconnectStartTime.current = null;
        return true;
    }

    // If they exceeded 30s, they stay locked until PIN validation succeeds
    // (handled separately in handleReconnect).
    return false;
  }, [checkWifi, requiresPin]);

  useEffect(() => {
    if (!enabled) {
      setWifiLocked(false);
      setRequiresPin(false);
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
      if (isPeer) {
        serverReachable = await PeerExamClient.ping();
      }

      if (cancelled) return;

      const connectionOk = isWifi && serverReachable;

      if (!connectionOk) {
        setWifiLocked(true);
        if (!disconnectStartTime.current) {
          disconnectStartTime.current = Date.now();
        }

        const elapsed = (Date.now() - disconnectStartTime.current) / 1000;
        if (elapsed > 30) {
          setRequiresPin(true);
        }

        if (wasConnected.current) {
          wasConnected.current = false;
          onDisconnectRef.current?.();
        }
      } else {
        // Connection is back. If they were already in the "Requires PIN" state,
        // we keep them locked but allow PIN entry.
        if (!requiresPin) {
            setWifiLocked(false);
            wasConnected.current = true;
            disconnectStartTime.current = null;
        }
      }
    };

    void tick();
    const id = setInterval(tick, 3000); // Polling every 3s for faster detection

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, requiresPin]);

  return {
    wifiLocked,
    requiresPin,
    wifiConnected,
    unlockAfterReconnect,
    setWifiLocked,
    setRequiresPin,
  };
}
