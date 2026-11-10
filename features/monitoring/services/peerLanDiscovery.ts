import * as Network from 'expo-network';
import { PEER_PATH_PREFIX, PEER_PORT, normalizeExaminationCode, type PeerQrTarget } from '@/features/examinations/services/peerExamServer';
import { resolveWifiLanIp, isPrivateLanIp } from '@/features/monitoring/services/wifiLanIp';

type DiscoveryResponse = {
  success?: boolean;
  data?: {
    code?: string;
    schedule_id?: number | null;
    room_id?: number | null;
    peer_identity_public_key?: string;
  };
};

function subnetPrefix(ip: string): string | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function discoverAtHost(host: string, code: string, timeoutMs = 850): Promise<PeerQrTarget | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${PEER_PORT}${PEER_PATH_PREFIX}/discover`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json().catch(() => null)) as DiscoveryResponse | null;
    const data = json?.data;
    const publicKey = String(data?.peer_identity_public_key ?? '').trim().toLowerCase();
    const discoveredCode = normalizeExaminationCode(data?.code);
    if (!json?.success || discoveredCode !== code || !/^[0-9a-f]{64}$/.test(publicKey)) {
      return null;
    }
    return {
      host,
      port: PEER_PORT,
      code: discoveredCode,
      scheduleId: data?.schedule_id ?? null,
      roomId: data?.room_id ?? null,
      wifiSsid: null,
      peerPublicKey: publicKey,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverPeerExamHostByCode(
  rawCode: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PeerQrTarget | null> {
  const code = normalizeExaminationCode(rawCode);
  if (code) {
    const { PeerExamClient } = await import('@/features/examinations/services/peerExamClient');
    const target = await PeerExamClient.getTarget();
    if (
      target?.code.trim().toUpperCase() === code &&
      /^[0-9a-f]{64}$/i.test(target.peerPublicKey)
    ) {
      onProgress?.(1, 1);
      return target;
    }
  }

  const resolved = await resolveWifiLanIp();
  const ip = resolved.ip || await Network.getIpAddressAsync().catch(() => null);
  if (!ip || !isPrivateLanIp(ip)) {
    onProgress?.(0, 0);
    return null;
  }
  const prefix = subnetPrefix(ip);
  if (!prefix) {
    onProgress?.(0, 0);
    return null;
  }

  const selfLast = Number(ip.split('.')[3]);
  const preferred = new Set<number>([1, 42, 100]);
  if (Number.isInteger(selfLast)) preferred.add(selfLast);
  const candidates = [
    ...preferred,
    ...Array.from({ length: 254 }, (_, index) => index + 1).filter((last) => !preferred.has(last)),
  ];
  const total = candidates.length;
  let done = 0;
  const concurrency = 24;

  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const found = await Promise.all(
      batch.map(async (last) => {
        const target = await discoverAtHost(`${prefix}.${last}`, code);
        done += 1;
        onProgress?.(done, total);
        return target;
      }),
    );
    const target = found.find(Boolean);
    if (target) return target;
  }

  return null;
}
