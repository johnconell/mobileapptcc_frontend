/**
 * Proctor Wi‑Fi lock — bind an exam room to the Wi‑Fi used when it was opened.
 * Switching networks does NOT migrate the session IP; the proctor must reconnect
 * to the locked SSID. Same-SSID DHCP IP changes may refresh the stored host IP.
 */
import * as Network from 'expo-network';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { appStorage } from '@/shared/services/storage';

const LOCK_STORAGE_PREFIX = 'tcc.proctor.wifi_lock.';

export type ProctorWifiIdentity = {
  ssid: string | null;
  /** Optional BSSID when the OS exposes it (often null without location permission). */
  bssid: string | null;
  localIp: string | null;
  isWifi: boolean;
};

export type WifiLockState = {
  locked: boolean;
  /** True when proctor left the locked Wi‑Fi (or left Wi‑Fi entirely). */
  violated: boolean;
  lockedSsid: string | null;
  lockedBssid: string | null;
  currentSsid: string | null;
  currentIp: string | null;
  message: string | null;
};

type MonitorOptions = {
  examSessionId?: number | null;
  lockedSsid?: string | null;
  lockedBssid?: string | null;
  onStateChange?: (state: WifiLockState) => void;
};

let listener: { remove: () => void } | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let options: MonitorOptions = {};
let lastState: WifiLockState | null = null;
let checking = false;

function normalizeSsid(ssid: string | null | undefined): string | null {
  if (!ssid) return null;
  const cleaned = String(ssid).replace(/^"|"$/g, '').trim();
  if (!cleaned || /^<?unknown\s*ssid>?$/i.test(cleaned) || cleaned === '0x') {
    return null;
  }
  return cleaned;
}

function normalizeBssid(bssid: string | null | undefined): string | null {
  if (!bssid) return null;
  const cleaned = String(bssid).trim().toLowerCase();
  if (!cleaned || cleaned === '02:00:00:00:00:00') return null;
  return cleaned;
}

function ssidsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function lockStorageKey(examSessionId: number | string): string {
  return `${LOCK_STORAGE_PREFIX}${examSessionId}`;
}

/** Read current Wi‑Fi identity from the device (expo-network). */
export async function readProctorWifiIdentity(): Promise<ProctorWifiIdentity> {
  try {
    const net = await Network.getNetworkStateAsync();
    const isWifi = net.type === Network.NetworkStateType.WIFI;
    const ssid = isWifi
      ? normalizeSsid((net as { ssid?: string | null }).ssid)
      : null;
    const bssid = isWifi
      ? normalizeBssid((net as { bssid?: string | null }).bssid)
      : null;
    const localIp = await Network.getIpAddressAsync().catch(() => null);
    const safeIp =
      localIp && localIp !== '0.0.0.0' && !localIp.startsWith('169.254.')
        ? localIp
        : null;
    return { ssid, bssid, localIp: safeIp, isWifi };
  } catch {
    return { ssid: null, bssid: null, localIp: null, isWifi: false };
  }
}

/**
 * Room open requires Wi‑Fi + a usable LAN IP. Throws a user-facing Error if not.
 */
export async function assertProctorWifiForRoomOpen(): Promise<ProctorWifiIdentity> {
  const identity = await readProctorWifiIdentity();
  if (!identity.isWifi) {
    throw new Error(
      'Connect to the examination Wi‑Fi before opening a room. Mobile data alone cannot host a LAN exam session.',
    );
  }
  if (!identity.localIp) {
    throw new Error(
      'This phone has no Wi‑Fi address yet. Stay on the exam Wi‑Fi and try again in a few seconds.',
    );
  }
  return identity;
}

export async function persistWifiLock(
  examSessionId: number | string,
  lock: { ssid: string | null; bssid: string | null; localIp: string | null },
): Promise<void> {
  await appStorage.setItem(
    lockStorageKey(examSessionId),
    JSON.stringify({
      ssid: lock.ssid,
      bssid: lock.bssid,
      localIp: lock.localIp,
      lockedAt: new Date().toISOString(),
    }),
  );
}

export async function loadWifiLock(
  examSessionId: number | string,
): Promise<{ ssid: string | null; bssid: string | null; localIp: string | null } | null> {
  const raw = await appStorage.getItem(lockStorageKey(examSessionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      ssid?: string | null;
      bssid?: string | null;
      localIp?: string | null;
    };
    return {
      ssid: normalizeSsid(parsed.ssid),
      bssid: normalizeBssid(parsed.bssid),
      localIp: parsed.localIp ?? null,
    };
  } catch {
    return null;
  }
}

function emit(state: WifiLockState) {
  lastState = state;
  options.onStateChange?.(state);
}

/**
 * Evaluate lock. Same locked SSID with a new DHCP IP may refresh the cloud host
 * IP. Leaving the locked Wi‑Fi sets violated=true and does NOT migrate the session.
 */
export async function evaluateProctorWifiLock(): Promise<WifiLockState> {
  if (checking) {
    return (
      lastState ?? {
        locked: Boolean(options.lockedSsid),
        violated: false,
        lockedSsid: options.lockedSsid ?? null,
        lockedBssid: options.lockedBssid ?? null,
        currentSsid: null,
        currentIp: null,
        message: null,
      }
    );
  }
  checking = true;
  try {
    const identity = await readProctorWifiIdentity();
    const lockedSsid = normalizeSsid(options.lockedSsid);
    const lockedBssid = normalizeBssid(options.lockedBssid);

    if (!lockedSsid && !lockedBssid) {
      const state: WifiLockState = {
        locked: false,
        violated: !identity.isWifi,
        lockedSsid: null,
        lockedBssid: null,
        currentSsid: identity.ssid,
        currentIp: identity.localIp,
        message: identity.isWifi
          ? null
          : 'Connect to Wi‑Fi to keep this examination room active.',
      };
      emit(state);
      return state;
    }

    const onLockedNetwork =
      identity.isWifi &&
      ((lockedSsid && ssidsMatch(identity.ssid, lockedSsid)) ||
        (lockedBssid &&
          identity.bssid &&
          identity.bssid === lockedBssid) ||
        // SSID unavailable to OS (privacy) — treat same LAN IP prefix + Wi‑Fi as ok
        (!identity.ssid &&
          !lockedBssid &&
          identity.isWifi &&
          Boolean(identity.localIp)));

    if (!onLockedNetwork) {
      const name = lockedSsid || 'the original exam Wi‑Fi';
      const state: WifiLockState = {
        locked: true,
        violated: true,
        lockedSsid,
        lockedBssid,
        currentSsid: identity.ssid,
        currentIp: identity.localIp,
        message: `You must stay connected to "${name}" while this room is active. Reconnect to continue.`,
      };
      emit(state);
      return state;
    }

    // Same locked network: keep peer host IP fresh for DHCP renewals only.
    if (identity.localIp) {
      const info = PeerExamServer.info();
      if (info.running && info.host !== identity.localIp) {
        await PeerExamServer.refreshHostIp();
        if (options.examSessionId) {
          try {
            await LobbyRepository.updateSessionNetwork(options.examSessionId, {
              localServerIp: identity.localIp,
              wifiSsid: lockedSsid ?? identity.ssid,
              wifiBssid: lockedBssid ?? identity.bssid,
              regenerateIfEmpty: false,
            });
          } catch {
            // Best-effort; lock still holds.
          }
        }
      }
    }

    const state: WifiLockState = {
      locked: true,
      violated: false,
      lockedSsid,
      lockedBssid,
      currentSsid: identity.ssid,
      currentIp: identity.localIp,
      message: null,
    };
    emit(state);
    return state;
  } finally {
    checking = false;
  }
}

export function startProctorWifiLockMonitor(next: MonitorOptions): () => void {
  stopProctorWifiLockMonitor();
  options = { ...next };

  void evaluateProctorWifiLock();

  try {
    if (typeof (Network as { addNetworkStateListener?: Function }).addNetworkStateListener === 'function') {
      listener = (Network as any).addNetworkStateListener(() => {
        setTimeout(() => {
          void evaluateProctorWifiLock();
        }, 800);
      });
    }
  } catch {
    // ignore
  }

  intervalId = setInterval(() => {
    void evaluateProctorWifiLock();
  }, 4000);

  return stopProctorWifiLockMonitor;
}

export function stopProctorWifiLockMonitor(): void {
  if (listener) {
    try {
      listener.remove();
    } catch {
      // ignore
    }
    listener = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  options = {};
  lastState = null;
}

/** @deprecated Use startProctorWifiLockMonitor — kept as alias for older imports. */
export const startProctorHostIpSync = startProctorWifiLockMonitor;
export const stopProctorHostIpSync = stopProctorWifiLockMonitor;
