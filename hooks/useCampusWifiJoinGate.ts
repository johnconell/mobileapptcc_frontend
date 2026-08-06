import { useCallback, useEffect, useState } from 'react';
import {
  assertCampusWifiForJoin,
  type CampusWifiGateResult,
} from '@/services/campusWifiGate';

/**
 * Polls campus Wi‑Fi + exam Hub reachability for student join screens.
 */
export function useCampusWifiJoinGate(options?: {
  /** Live QR / lobby join always needs Hub reachability. */
  requireServer?: boolean;
  pollMs?: number;
}) {
  const requireServer = options?.requireServer ?? true;
  const pollMs = options?.pollMs ?? 2500;
  const [result, setResult] = useState<CampusWifiGateResult>({
    ok: false,
    wifiConnected: false,
    serverReachable: null,
    message: 'Checking Wi‑Fi…',
  });
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(
    async (scannedPayload?: string) => {
      setChecking(true);
      const next = await assertCampusWifiForJoin({ requireServer, scannedPayload });
      setResult(next);
      setChecking(false);
      return next;
    },
    [requireServer],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await assertCampusWifiForJoin({ requireServer });
      if (!cancelled) {
        setResult(next);
        setChecking(false);
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [requireServer, pollMs]);

  return {
    ...result,
    checking,
    refresh,
  };
}
