import { useCallback, useEffect, useRef, useState } from 'react';
import { isWifiConnected } from '@/features/monitoring/services/campusWifiGate';
import * as Network from 'expo-network';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';

export type WifiDisconnectReason =
  | 'wifi_lost'               // Wi-Fi turned off or disconnected entirely
  | 'wrong_network'           // Student connected to a different Wi-Fi network
  | 'proctor_network_change'; // Student on correct Wi-Fi but proctor changed IP

/**
 * Grace period before PIN escalation and auto-submit (2 minutes).
 * This gives students enough time to reconnect accidentally dropped Wi-Fi
 * without immediately locking them out or submitting their exam.
 */
const GRACE_PERIOD_SECONDS = 120;

type WifiGateOptions = {
  enabled: boolean;
  onDisconnect?: (reason: WifiDisconnectReason) => void;
  /** Called once when the grace period expires with no reconnect (auto-submit hook). */
  onGraceExpired?: () => void;
  /** Configurable grace period in seconds (configured by admin). Defaults to 120s. */
  gracePeriodSeconds?: number;
};

/**
 * Campus anti-cheat: exam requires any Wi‑Fi connection on the correct network.
 * Turning Wi‑Fi off (or leaving Wi‑Fi) locks the exam until reconnect succeeds.
 * Connecting to the WRONG Wi-Fi is also detected and reported separately.
 * Includes a configurable grace period (default 120 seconds / 2 minutes) before:
 *   (a) a hard Reconnect PIN is required, and
 *   (b) onGraceExpired() is called to trigger auto-submission.
 *
 * When Wi‑Fi is up but the proctor peer is unreachable and the SSID matches,
 * we first refresh the host IP from the cloud (proctor may have changed networks)
 * before locking. Proctor-side network changes do not count as examinee violations.
 *
 * Three disconnect reasons:
 *   'wifi_lost'             — Wi-Fi turned off or dropped entirely
 *   'wrong_network'         — Student connected to a different Wi-Fi SSID
 *   'proctor_network_change'— Student on correct Wi-Fi, proctor changed IP
 */
export function useWifiExamGate({
  enabled,
  onDisconnect,
  onGraceExpired,
  gracePeriodSeconds,
}: WifiGateOptions) {
  const [wifiLocked, setWifiLocked] = useState(false);
  const [requiresPin, setRequiresPin] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(true);
  const [disconnectReason, setDisconnectReason] = useState<WifiDisconnectReason | null>(null);
  const [graceSecondsRemaining, setGraceSecondsRemaining] = useState<number | null>(null);
  const wasConnected = useRef(true);
  const disconnectStartTime = useRef<number | null>(null);
  const graceExpiredRef = useRef(false);

  const effectiveGraceSeconds =
    typeof gracePeriodSeconds === 'number' && gracePeriodSeconds > 0
      ? gracePeriodSeconds
      : GRACE_PERIOD_SECONDS;

  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const onGraceExpiredRef = useRef(onGraceExpired);
  onGraceExpiredRef.current = onGraceExpired;

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
      setGraceSecondsRemaining(null);
      graceExpiredRef.current = false;
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
      setGraceSecondsRemaining(null);
      graceExpiredRef.current = false;
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
        // Wi-Fi is completely off (cellular or no connection).
        serverReachable = false;
        reason = 'wifi_lost';
      } else if (isPeer) {
        // Student is on SOME Wi-Fi. First check whether it is the CORRECT network
        // by comparing SSIDs. On Android 10+ SSID may be empty without fine-location
        // permission — in that case fall through to a ping-based check only.
        const peerTarget = await PeerExamClient.getTarget();
        const currentSsid = ((netState as Record<string, unknown>).ssid as string | undefined) ?? '';
        const expectedSsid = peerTarget?.wifiSsid ?? '';

        const cleanCurrent = currentSsid.replace(/^"|"$/g, '').trim();
        const cleanExpected = expectedSsid.replace(/^"|"$/g, '').trim();

        const ssidsKnown =
          cleanCurrent.length > 0 &&
          cleanExpected.length > 0 &&
          cleanCurrent.toLowerCase() !== '<unknown ssid>';

        if (ssidsKnown && cleanCurrent.toLowerCase() !== cleanExpected.toLowerCase()) {
          // Student switched to a different Wi-Fi network.
          serverReachable = false;
          reason = 'wrong_network';
        } else {
          // SSIDs match (or we can't read them) — check if the proctor is reachable.
          serverReachable = await PeerExamClient.ping();
          if (!serverReachable) {
            // Proctor may have moved Wi‑Fi / got a new DHCP lease — refresh cloud IP once.
            const refreshed = await PeerExamClient.refreshHostFromCloud();
            if (refreshed) {
              serverReachable = await PeerExamClient.ping();
            }
            if (!serverReachable) {
              // Student is on the correct SSID, proctor changed their IP — not the student's fault.
              reason = 'proctor_network_change';
            }
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
          graceExpiredRef.current = false;
        }

        const elapsed = (Date.now() - disconnectStartTime.current) / 1000;
        const remaining = Math.max(0, Math.ceil(effectiveGraceSeconds - elapsed));
        setGraceSecondsRemaining(remaining);

        // Only wifi_lost and wrong_network escalate to PIN — proctor change does not.
        const escalatesPin = reason === 'wifi_lost' || reason === 'wrong_network';
        if (escalatesPin && elapsed > effectiveGraceSeconds) {
          setRequiresPin(true);
          // Call onGraceExpired exactly once.
          if (!graceExpiredRef.current) {
            graceExpiredRef.current = true;
            onGraceExpiredRef.current?.();
          }
        }

        if (wasConnected.current) {
          wasConnected.current = false;
          onDisconnectRef.current?.(reason);
        }
      } else {
        if (!requiresPin) {
          setWifiLocked(false);
          setDisconnectReason(null);
          setGraceSecondsRemaining(null);
          graceExpiredRef.current = false;
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
  }, [enabled, requiresPin, effectiveGraceSeconds]);

  return {
    wifiLocked,
    requiresPin,
    wifiConnected,
    disconnectReason,
    graceSecondsRemaining,
    unlockAfterReconnect,
    setWifiLocked,
    setRequiresPin,
  };
}
