import * as Network from 'expo-network';

export type DiscoveredServer = {
  ip: string;
  url: string;
  label: string;
};

function subnetPrefix(ip: string): string | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function probe(url: string, timeoutMs = 700): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // Any HTTP response means the host:port is open enough for our purposes.
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apps cannot list Wi‑Fi SSIDs and turn them into a Laravel URL.
 * Instead we discover exam servers already on the *current* Wi‑Fi
 * by probing the local subnet for :8000.
 */
export async function discoverLanExamServers(
  onProgress?: (done: number, total: number) => void,
): Promise<DiscoveredServer[]> {
  const ip = await Network.getIpAddressAsync().catch(() => null);
  if (!ip || ip === '0.0.0.0' || ip.startsWith('127.')) {
    throw new Error(
      'This phone is not on Wi‑Fi yet. Connect to the exam Wi‑Fi, then try Find servers again.',
    );
  }

  const prefix = subnetPrefix(ip);
  if (!prefix) {
    throw new Error(`Could not read Wi‑Fi address (${ip}).`);
  }

  const found: DiscoveredServer[] = [];

  // Probe own IP / gateway / common hosts first, then the rest of /24.
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
  const concurrency = 24;

  const scanBatch = async (octets: number[]) => {
    for (let i = 0; i < octets.length; i += concurrency) {
      const batch = octets.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (n) => {
          const host = `${prefix}.${n}`;
          const base = `http://${host}:8000`;
          const api = `${base}/api/v1`;
          // Any response on :8000 means a host is listening (typical artisan serve).
          if (await probe(base)) {
            found.push({
              ip: host,
              url: api,
              label:
                host === ip
                  ? `${host} (this phone / same device)`
                  : `Exam server · ${host}`,
            });
          }
          done += 1;
          onProgress?.(done, total);
        }),
      );
    }
  };

  await scanBatch([...preferred]);
  if (found.length === 0) {
    await scanBatch(rest);
  } else {
    done = total;
    onProgress?.(done, total);
  }

  // De-dupe by IP
  const uniq = new Map<string, DiscoveredServer>();
  found.forEach((s) => uniq.set(s.ip, s));
  return Array.from(uniq.values());
}

export async function getWifiHint(): Promise<string> {
  try {
    const state = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();
    if (!state.isConnected) return 'Not connected to a network.';
    if (state.type === Network.NetworkStateType.WIFI) {
      return `On Wi‑Fi · phone IP ${ip || 'unknown'}. Finding PCs on the same Wi‑Fi…`;
    }
    return `Network type: ${state.type}. Prefer Wi‑Fi for exam discovery. Phone IP: ${ip || 'unknown'}`;
  } catch {
    return 'Connect this phone to the exam Wi‑Fi first.';
  }
}
