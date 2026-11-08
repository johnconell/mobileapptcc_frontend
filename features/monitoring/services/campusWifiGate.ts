import * as Network from 'expo-network';
import { getApiBaseUrl } from '@/shared/services/api';
import { isLoopbackApiHost, requiresLanApiHost } from '@/shared/services/apiReachability';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { parsePeerQr } from '@/features/examinations/services/peerExamServer';
import { resolveWifiLanIp } from '@/features/monitoring/services/wifiLanIp';

export type CampusWifiGateResult = {
  ok: boolean;
  wifiConnected: boolean;
  serverReachable: boolean | null;
  message: string | null;
};

/** Rule 2A: any Wi‑Fi interface connected (not cellular-only). */
export async function isWifiConnected(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return (
      Boolean(state.isConnected) && state.type === Network.NetworkStateType.WIFI
    );
  } catch {
    return false;
  }
}

/**
 * Probe the configured exam Hub. Any HTTP response (including 4xx) means the
 * phone can reach the LAN/cloud API — i.e. it is on a usable exam network.
 */
export async function probeExamServerReachable(
  timeoutMs = 4500,
): Promise<boolean> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  if (requiresLanApiHost() && isLoopbackApiHost(base)) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${base}/exam/resolve`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: '__wifi_probe__' }),
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate network AFTER a QR scan or examination-code submit, or before Proctor room open:
 * 1) Must be on Wi‑Fi (not mobile data alone).
 * 2) Proctor actions: verify Wi-Fi is on; DO NOT check or ping student peer targets.
 * 3) Student Peer QR → ping the proctor phone on LAN.
 * 4) Live Hub codes → probe Laravel. Typed / offline codes skip the Hub probe (LAN peer discovery).
 */
export async function assertCampusWifiForJoin(options?: {
  /** When verifying a typed code; OFF-* skips Hub probe. */
  examinationCode?: string;
  /** Scan screen always probes Hub (QR is live lobby). */
  requireServer?: boolean;
  /** Raw scanned QR, so a peer QR is probed against the proctor phone. */
  scannedPayload?: string;
  /** Set true for Proctor actions so student peer targets are NEVER pinged. */
  isProctor?: boolean;
}): Promise<CampusWifiGateResult> {
  const netState = await Network.getNetworkStateAsync();
  let wifiConnected = netState.isConnected === true && netState.type === Network.NetworkStateType.WIFI;

  // Android hotspot hosting may report cellular/unknown as the primary route.
  // Accept it for proctors only when a real Wi-Fi/hotspot LAN interface exists.
  if (!wifiConnected && options?.isProctor) {
    wifiConnected = Boolean((await resolveWifiLanIp()).ip);
  }

  const officialWifiMessage =
    'You must connect to the official examination Wi-Fi network before joining this examination.';

  if (!wifiConnected) {
    const msg = options?.isProctor
      ? 'This phone has no Wi‑Fi connection. Connect to the examination Wi‑Fi or turn on a mobile hotspot and try again.'
      : officialWifiMessage;
    return {
      ok: false,
      wifiConnected: false,
      serverReachable: null,
      message: msg,
    };
  }

  // PROCTOR ROLE ISOLATION: A Proctor opening a room must NEVER ping a Student peer target!
  if (options?.isProctor) {
    if (__DEV__) console.log('[WIFI GATE] Proctor validation passed: Wi-Fi interface connected.');
    return {
      ok: true,
      wifiConnected: true,
      serverReachable: true,
      message: null,
    };
  }

  // Student Peer mode: "matching the proctor" means reaching the proctor's phone on the same Wi-Fi LAN.
  const peerTarget =
    (options?.scannedPayload ? parsePeerQr(options.scannedPayload) : null) ??
    (options?.examinationCode ? null : (await PeerExamClient.getTarget()));

  if (peerTarget) {
    // SSIDs are advisory only: Android frequently hides them, and a phone-hosted
    // hotspot can report a different/unknown SSID to the host and client. Subnet
    // prefixes are also not reliable on hotspot and enterprise LAN topologies.
    // The authenticated peer health probe is the source of truth for same-LAN
    // connectivity.
    const reachable = await PeerExamClient.ping(peerTarget);
    if (!reachable) {
      return {
        ok: false,
        wifiConnected: true,
        serverReachable: false,
        message:
          `The proctor examination host at ${peerTarget.host} is not reachable on this local network. ` +
          'Check that the room is still open and that device-to-device connections are allowed, then scan the current QR code again.',
      };
    }

    return { ok: true, wifiConnected: true, serverReachable: true, message: null };
  }

  const code = options?.examinationCode?.trim() ?? '';
  // Typed examination codes resolve against the proctor phone on LAN
  // (peer discovery in verifyExaminationCode). Offline pack codes skip Hub too.
  let skipServer =
    options?.requireServer === false || code.length > 0;

  if (!skipServer) {
    try {
      const { OfflineStore } = await import('@/features/synchronization/services/offlineStore');
      if (await OfflineStore.isOfflineMode()) skipServer = true;
    } catch {
      // ignore
    }
  }

  if (skipServer || options?.requireServer === false) {
    return {
      ok: true,
      wifiConnected: true,
      serverReachable: null,
      message: null,
    };
  }

  const serverReachable = await probeExamServerReachable();
  if (!serverReachable) {
    return {
      ok: false,
      wifiConnected: true,
      serverReachable: false,
      message: officialWifiMessage,
    };
  }

  return {
    ok: true,
    wifiConnected: true,
    serverReachable: true,
    message: null,
  };
}
