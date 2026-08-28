import * as Network from 'expo-network';
import { getApiBaseUrl } from '@/services/api';
import { isLoopbackApiHost, requiresLanApiHost } from '@/services/apiReachability';
import { PeerExamClient } from '@/services/peerExamClient';
import { parsePeerQr } from '@/services/peerExamServer';

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

function isOfflinePackCode(code: string): boolean {
  return /^OFF-\d+(?:-R\d+)?$/i.test(code.trim());
}

/**
 * Validate network AFTER a QR scan or examination-code submit:
 * 1) Must be on Wi‑Fi (not mobile data alone).
 * 2) Peer QR → ping the proctor phone on LAN.
 * 3) Live Hub codes → probe Laravel. Offline OFF-* codes skip the Hub probe.
 */
export async function assertCampusWifiForJoin(options?: {
  /** When verifying a typed code; OFF-* skips Hub probe. */
  examinationCode?: string;
  /** Scan screen always probes Hub (QR is live lobby). */
  requireServer?: boolean;
  /** Raw scanned QR, so a peer QR is probed against the proctor phone. */
  scannedPayload?: string;
}): Promise<CampusWifiGateResult> {
  const netState = await Network.getNetworkStateAsync();
  const wifiConnected = netState.type === Network.NetworkStateType.WIFI;

  const mismatchMessage =
    'You are connected to a different examination network. Please connect to the same Wi‑Fi network as the proctor and scan again.';

  if (!wifiConnected) {
    return {
      ok: false,
      wifiConnected: false,
      serverReachable: null,
      message: mismatchMessage,
    };
  }

  // Peer mode: "matching the proctor" means reaching the proctor's phone, not Laravel.
  const peerTarget =
    (options?.scannedPayload ? parsePeerQr(options.scannedPayload) : null) ??
    (await PeerExamClient.getTarget());

  if (peerTarget) {
    const reachable = await PeerExamClient.ping(peerTarget);
    if (!reachable) {
      return {
        ok: false,
        wifiConnected: true,
        serverReachable: false,
        message: mismatchMessage,
      };
    }

    // Ping succeeded! We are on the right network.
    // SSID check is now secondary (informative only) to avoid blocking students
    // on devices that cannot report SSID (Android 10+ needs location perms).
    if (peerTarget.wifiSsid && netState.ssid && netState.ssid !== peerTarget.wifiSsid) {
       if (__DEV__) console.warn(`[WIFI] SSID Mismatch: Expected ${peerTarget.wifiSsid}, got ${netState.ssid}. Allowing anyway because ping succeeded.`);
    }

    return { ok: true, wifiConnected: true, serverReachable: true, message: null };
  }

  const code = options?.examinationCode?.trim() ?? '';
  let skipServer =
    options?.requireServer === false ||
    (code.length > 0 && isOfflinePackCode(code));

  // Opened local lobbies use normal codes (K7M2P9QX) — skip Laravel hub probe.
  if (!skipServer && code.length > 0) {
    try {
      const { OfflineStore } = await import('@/services/offlineStore');
      const opened = await OfflineStore.findOpenedRoomByCode(code);
      if (opened) skipServer = true;
      if (!skipServer && await OfflineStore.isOfflineMode()) skipServer = true;
    } catch {
      // ignore
    }
  }

  if (skipServer) {
    return {
      ok: true,
      wifiConnected: true,
      serverReachable: null,
      message: null,
    };
  }

  const serverReachable = await probeExamServerReachable();
  if (!serverReachable) {
    const host = (() => {
      try {
        return new URL(getApiBaseUrl()).host;
      } catch {
        return getApiBaseUrl();
      }
    })();
    return {
      ok: false,
      wifiConnected: true,
      serverReachable: false,
      message: `${mismatchMessage}\n\n(Cannot reach exam server ${host}.)`,
    };
  }

  return {
    ok: true,
    wifiConnected: true,
    serverReachable: true,
    message: null,
  };
}
