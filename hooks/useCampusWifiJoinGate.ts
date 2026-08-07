import { useCallback, useState } from 'react';
import {
  assertCampusWifiForJoin,
  type CampusWifiGateResult,
} from '@/services/campusWifiGate';

/**
 * On-demand campus Wi‑Fi / proctor reachability for student join screens.
 * Does NOT poll on mount — validation runs only when refresh() is called
 * (after a QR scan or examination-code submit).
 */
export function useCampusWifiJoinGate(options?: {
  /** Live QR / lobby join may need Hub reachability when not peer. */
  requireServer?: boolean;
}) {
  const requireServer = options?.requireServer ?? true;
  const [result, setResult] = useState<CampusWifiGateResult>({
    ok: true,
    wifiConnected: true,
    serverReachable: null,
    message: null,
  });
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(
    async (scannedPayload?: string, examinationCode?: string) => {
      setChecking(true);
      const next = await assertCampusWifiForJoin({
        requireServer,
        scannedPayload,
        examinationCode,
      });
      setResult(next);
      setChecking(false);
      return next;
    },
    [requireServer],
  );

  return {
    ...result,
    checking,
    refresh,
  };
}
