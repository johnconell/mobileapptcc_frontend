import * as Network from 'expo-network';
import {
  PEER_PATH_PREFIX,
  PEER_PORT,
  type PeerQrTarget,
} from '@/features/examinations/services/peerExamServer';

function subnetPrefix(ip: string): string | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function probePeerHealth(host: string, timeoutMs = 600): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `http://${host}:${PEER_PORT}${PEER_PATH_PREFIX}/health`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCodeOnHost(
  host: string,
  code: string,
  timeoutMs = 2500,
): Promise<PeerQrTarget | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `http://${host}:${PEER_PORT}${PEER_PATH_PREFIX}/resolve`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
    if (!res.ok || json?.success === false) return null;
    const data = json?.data ?? json;
    if (!data?.schedule || !data?.session) return null;
    return {
      host,
      port: PEER_PORT,
      code: String(data.examinationCode || code).trim().toUpperCase(),
      scheduleId: data.schedule?.id != null ? Number(data.schedule.id) : null,
      roomId: data.session?.roomId != null ? Number(data.session.roomId) : null,
      wifiSsid: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find the proctor phone on the current Wi‑Fi by probing :9777, then resolve
 * a typed examination code against it. Used when the student enters a code
 * instead of scanning the peer QR (which already embeds host+port).
 */
export async function discoverPeerExamHostByCode(
  rawCode: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PeerQrTarget | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const ip = await Network.getIpAddressAsync().catch(() => null);
  if (!ip || ip === '0.0.0.0' || ip.startsWith('127.')) {
    throw new Error(
      'This phone is not on Wi‑Fi yet. Connect to the same Wi‑Fi as the proctor, then try again.',
    );
  }

  const prefix = subnetPrefix(ip);
  if (!prefix) {
    throw new Error(`Could not read Wi‑Fi address (${ip}).`);
  }

  const preferred = new Set<number>();
  const selfLast = Number(ip.split('.')[3]);
  if (!Number.isNaN(selfLast)) preferred.add(selfLast);
  preferred.add(1);
  preferred.add(100);
  preferred.add(42);

  const rest: number[] = [];
  for (let n = 1; n <= 254; n++) {
    if (!preferred.has(n)) rest.push(n);
  }
  const candidates = [...preferred, ...rest];
  const total = candidates.length;
  let done = 0;
  const concurrency = 32;

  const scan = async (octets: number[]): Promise<PeerQrTarget | null> => {
    for (let i = 0; i < octets.length; i += concurrency) {
      const batch = octets.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (n) => {
          const host = `${prefix}.${n}`;
          const alive = await probePeerHealth(host);
          done += 1;
          onProgress?.(done, total);
          if (!alive) return null;
          return resolveCodeOnHost(host, code);
        }),
      );
      const hit = results.find(Boolean) ?? null;
      if (hit) return hit;
    }
    return null;
  };

  const preferredHit = await scan([...preferred]);
  if (preferredHit) return preferredHit;
  return scan(rest);
}
