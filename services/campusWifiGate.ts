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
 * Before QR scan / examination-code entry:
 * 1) Must be on Wi‑Fi (not mobile data alone).
 * 2) Live lobby codes also require the exam Hub to be reachable (same LAN /
 *    correct network as the exam computer). Offline OFF-* codes only need Wi‑Fi
 *    once the pack is already on the phone.
 */
export async function assertCampusWifiForJoin(options?: {
  /** When verifying a typed code; OFF-* skips Hub probe. */
  examinationCode?: string;
  /** Scan screen always probes Hub (QR is live lobby). */
  requireServer?: boolean;
  /** Raw scanned QR, so a peer QR is probed against the proctor phone. */
  scannedPayload?: string;
}): Promise<CampusWifiGateResult> {
  const wifiConnected = await isWifiConnected();
  if (!wifiConnected) {
    return {
      ok: false,
      wifiConnected: false,
      serverReachable: null,
      message:
        'Wi‑Fi / LAN does not match the proctor exam network.\n\n' +
        'Connect this phone to the SAME Wi‑Fi as the proctor / exam computer, then scan again. ' +
        'Mobile data or a different hotspot will not work.',
    };
  }

  // Peer mode: "matching the proctor" means reaching the proctor's phone, not Laravel.
  const peerTarget =
    (options?.scannedPayload ? parsePeerQr(options.scannedPayload) : null) ??
    (await PeerExamClient.getTarget());
  if (peerTarget) {
    const reachable = await PeerExamClient.ping(peerTarget);
    return reachable
      ? { ok: true, wifiConnected: true, serverReachable: true, message: null }
      : {
          ok: false,
          wifiConnected: true,
          serverReachable: false,
          message:
            'Wi‑Fi does not match the proctor.\n\n' +
            `This phone cannot reach the proctor phone (${peerTarget.host}). ` +
            'Join the SAME Wi‑Fi as the proctor (or the proctor hotspot), then scan again.',
        };
  }

  const code = options?.examinationCode?.trim() ?? '';
  const skipServer =
    options?.requireServer === false ||
    (code.length > 0 && isOfflinePackCode(code));

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
      message:
        'Wi‑Fi / LAN does not match the proctor exam network.\n\n' +
        `This phone cannot reach the exam server (${host}). ` +
        'Join the same Wi‑Fi as the proctor, then try scanning or entering the code again.',
    };
  }

  return {
    ok: true,
    wifiConnected: true,
    serverReachable: true,
    message: null,
  };
}
