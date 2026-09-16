import * as Network from 'expo-network';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';

type SyncOptions = {
  /** Laravel exam_sessions.id — required to push IP to cloud. */
  examSessionId?: number | null;
  /** Called after local QR / host IP changes so the lobby UI can refresh. */
  onHostChanged?: (host: string | null) => void;
};

let listener: { remove: () => void } | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let options: SyncOptions = {};
let lastSyncedIp: string | null = null;
let syncing = false;

async function readWifiSsid(): Promise<string | null> {
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) return null;
    const ssid = (net as { ssid?: string | null }).ssid;
    const cleaned = ssid ? String(ssid).replace(/^"|"$/g, '').trim() : '';
    if (!cleaned || /^<?unknown\s*ssid>?$/i.test(cleaned)) return null;
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Refresh the proctor LAN IP on the local peer server and push it to Laravel
 * so examinees can resolve the current host after a Wi‑Fi / DHCP change.
 */
export async function syncProctorHostIp(force = false): Promise<string | null> {
  if (syncing) return lastSyncedIp;
  const info = PeerExamServer.info();
  if (!info.running && !options.examSessionId) return null;

  syncing = true;
  try {
    const ip = (await PeerExamServer.refreshHostIp()) ?? info.host;
    if (!ip || ip === '0.0.0.0') return lastSyncedIp;

    const changed = force || ip !== lastSyncedIp;
    if (changed) {
      lastSyncedIp = ip;
      options.onHostChanged?.(ip);

      if (options.examSessionId) {
        const wifiSsid = await readWifiSsid();
        try {
          const result = await LobbyRepository.updateSessionNetwork(options.examSessionId, {
            localServerIp: ip,
            wifiSsid,
            // Mint a new code only while lobby is empty (server decides).
            regenerateIfEmpty: true,
          });
          if (result.codeRegenerated && result.snapshot?.examinationCode) {
            await PeerExamServer.adoptExamCode(result.snapshot.examinationCode);
            options.onHostChanged?.(ip);
          }
        } catch (err) {
          if (__DEV__) {
            console.warn('[PROCTOR IP SYNC] Cloud update failed (LAN QR still refreshed):', err);
          }
        }
      }
    }

    return ip;
  } finally {
    syncing = false;
  }
}

/**
 * Start listening for Wi‑Fi / network changes while a room is active.
 * Safe to call multiple times — replaces the previous listener.
 */
export function startProctorHostIpSync(next: SyncOptions): () => void {
  stopProctorHostIpSync();
  options = { ...next };
  lastSyncedIp = PeerExamServer.info().host;

  void syncProctorHostIp(true);

  try {
    if (typeof (Network as { addNetworkStateListener?: Function }).addNetworkStateListener === 'function') {
      listener = (Network as any).addNetworkStateListener(() => {
        // DHCP / interface can lag a second behind the network event.
        setTimeout(() => {
          void syncProctorHostIp(true);
        }, 1200);
      });
    }
  } catch {
    // expo-network may not expose the listener on all platforms
  }

  intervalId = setInterval(() => {
    void syncProctorHostIp(false);
  }, 8000);

  return stopProctorHostIpSync;
}

export function stopProctorHostIpSync(): void {
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
}
