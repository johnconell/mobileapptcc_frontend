import { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';

type WifiGateOptions = {
  enabled: boolean;
  onDisconnect?: () => void;
};

/**
 * Campus anti-cheat: exam requires any Wi‑Fi connection.
 * Turning Wi‑Fi off (or leaving Wi‑Fi) locks the exam until reconnect succeeds.
 */
export function useWifiExamGate({ enabled, onDisconnect }: WifiGateOptions) {
  const [wifiLocked, setWifiLocked] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(true);
  const wasConnected = useRef(true);
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const checkWifi = useCallback(async (): Promise<boolean> => {
    try {
      const state = await Network.getNetworkStateAsync();
      const ok =
        Boolean(state.isConnected) &&
        state.type === Network.NetworkStateType.WIFI;
      setWifiConnected(ok);
      return ok;
    } catch {
      setWifiConnected(false);
      return false;
    }
  }, []);

  const unlockAfterReconnect = useCallback(async () => {
    const ok = await checkWifi();
    if (!ok) {
      setWifiLocked(true);
      return false;
    }
    setWifiLocked(false);
    wasConnected.current = true;
    return true;
  }, [checkWifi]);

  useEffect(() => {
    if (!enabled) {
      setWifiLocked(false);
      wasConnected.current = true;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const ok = await checkWifi();
      if (cancelled) return;

      if (!ok) {
        setWifiLocked(true);
        if (wasConnected.current) {
          wasConnected.current = false;
          onDisconnectRef.current?.();
        }
      } else {
        wasConnected.current = true;
        // Stay locked until proctor reconnect succeeds (unlockAfterReconnect).
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, checkWifi]);

  return {
    wifiLocked,
    wifiConnected,
    unlockAfterReconnect,
    setWifiLocked,
  };
}
