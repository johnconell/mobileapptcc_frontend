import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import {
  type PeerRejoinResult,
  type StudentHeartbeat,
  LobbyRepository,
} from '@/features/lobby/repositories/LobbyRepository';
import {
  EXAM_WIFI_RECONNECT_MESSAGE,
  getExamineeWifiState,
} from '@/features/monitoring/services/examineeWifiBinding';

const RETRY_INTERVAL_MS = 2500;

type UsePeerAutoReconnectOptions = {
  enabled: boolean;
  onReconnected?: (pulse: StudentHeartbeat) => void | Promise<void>;
};

function isTerminal(result: PeerRejoinResult): boolean {
  return result.terminal === 'removed' || result.terminal === 'ended';
}

/** Keeps a saved peer attempt alive across Wi-Fi/mobile-data route changes. */
export function usePeerAutoReconnect({
  enabled,
  onReconnected,
}: UsePeerAutoReconnectOptions): {
  reconnecting: boolean;
  networkBanner: string | null;
  retryNow: () => void;
} {
  const [reconnecting, setReconnecting] = useState(false);
  const [networkBanner, setNetworkBanner] = useState<string | null>(null);
  const activeRef = useRef(enabled);
  const inFlightRef = useRef(false);
  const reconnectingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWifiRef = useRef<boolean | null>(null);
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const setReconnectState = useCallback((value: boolean) => {
    reconnectingRef.current = value;
    setReconnecting(value);
  }, []);

  const attemptRef = useRef<() => Promise<void>>(async () => undefined);
  const scheduleRetry = useCallback(() => {
    if (!activeRef.current || retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void attemptRef.current();
    }, RETRY_INTERVAL_MS);
  }, []);

  const attemptRejoin = useCallback(async () => {
    if (!activeRef.current || inFlightRef.current) return;
    if (!(await PeerExamClient.isActive())) return;

    inFlightRef.current = true;
    setReconnectState(true);
    try {
      const wifi = await getExamineeWifiState();
      if (!wifi.isWifi) {
        setNetworkBanner(EXAM_WIFI_RECONNECT_MESSAGE);
        scheduleRetry();
        return;
      }

      setNetworkBanner(null);
      const result = await LobbyRepository.rejoinPeerStudent();
      if (result.ok && result.pulse) {
        clearRetry();
        setReconnectState(false);
        await onReconnectedRef.current?.(result.pulse);
        return;
      }

      if (isTerminal(result)) {
        clearRetry();
        setReconnectState(false);
        return;
      }

      // A proctor may have received a new DHCP address. Refresh from cloud
      // when available, then fall back to the pinned local-LAN discovery path
      // inside PeerExamClient when the room has no internet.
      await PeerExamClient.refreshHostFromCloud().catch(() => undefined);
      scheduleRetry();
    } catch {
      scheduleRetry();
    } finally {
      inFlightRef.current = false;
    }
  }, [clearRetry, scheduleRetry, setReconnectState]);

  attemptRef.current = attemptRejoin;

  const retryNow = useCallback(() => {
    void attemptRejoin();
  }, [attemptRejoin]);

  useEffect(() => {
    activeRef.current = enabled;
    if (!enabled) {
      clearRetry();
      setReconnectState(false);
      setNetworkBanner(null);
      lastWifiRef.current = null;
      return;
    }

    let cancelled = false;
    const onNetworkState = (state: { type: string; isConnected: boolean | null }) => {
      if (cancelled) return;
      const isWifi = state.type === 'wifi' && state.isConnected === true;
      const wasWifi = lastWifiRef.current;
      lastWifiRef.current = isWifi;

      if (!isWifi) {
        setNetworkBanner(EXAM_WIFI_RECONNECT_MESSAGE);
        setReconnectState(true);
        scheduleRetry();
        return;
      }

      setNetworkBanner(null);
      if (wasWifi === false || reconnectingRef.current) {
        void attemptRejoin();
      }
    };

    const networkSubscription = NetInfo.addEventListener(onNetworkState);
    const peerUnsubscribe = PeerExamClient.subscribeConnection((event) => {
      if (cancelled) return;
      if (event === 'drop') {
        setNetworkBanner(EXAM_WIFI_RECONNECT_MESSAGE);
        setReconnectState(true);
        void attemptRejoin();
      } else {
        clearRetry();
        setReconnectState(false);
        setNetworkBanner(null);
      }
    });

    void NetInfo.fetch().then((state) => {
      if (!cancelled) onNetworkState(state);
    });

    return () => {
      cancelled = true;
      activeRef.current = false;
      clearRetry();
      networkSubscription();
      peerUnsubscribe();
    };
  }, [attemptRejoin, clearRetry, enabled, scheduleRetry, setReconnectState]);

  return { reconnecting, networkBanner, retryNow };
}

