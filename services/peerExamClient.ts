import { STORAGE_KEYS } from '@/constants';
import { PEER_PATH_PREFIX, PEER_PORT, type PeerQrTarget } from '@/services/peerExamServer';
import { appStorage } from '@/services/storage';

export type PeerTarget = {
  host: string;
  port: number;
  code: string;
  scheduleId: number | null;
  roomId: number | null;
  wifiSsid: string | null;
};

let cached: PeerTarget | null | undefined;

function baseUrl(target: PeerTarget): string {
  return `http://${target.host}:${target.port}${PEER_PATH_PREFIX}`;
}

/**
 * PeerExamClient — student side of peer mode. The proctor phone hosts the exam
 * over the local Wi‑Fi, so every request here goes to that phone, not Laravel.
 */
export const PeerExamClient = {
  async setTarget(target: PeerQrTarget): Promise<void> {
    const value: PeerTarget = {
      host: target.host,
      port: target.port || PEER_PORT,
      code: target.code,
      scheduleId: target.scheduleId,
      roomId: target.roomId,
      wifiSsid: target.wifiSsid,
    };
    cached = value;
    await appStorage.setItem(STORAGE_KEYS.peerTarget, JSON.stringify(value));
  },

  async getTarget(): Promise<PeerTarget | null> {
    if (cached !== undefined) return cached;
    const raw = await appStorage.getItem(STORAGE_KEYS.peerTarget);
    if (!raw) {
      cached = null;
      return null;
    }
    try {
      cached = JSON.parse(raw) as PeerTarget;
    } catch {
      cached = null;
    }
    return cached;
  },

  async isActive(): Promise<boolean> {
    return Boolean(await this.getTarget());
  },

  async clear(): Promise<void> {
    cached = null;
    await appStorage.deleteItem(STORAGE_KEYS.peerTarget);
  },

  /**
   * Ultra-fast signal check (Fix Root Cause 1 & 2).
   * Polls the server for GLOBAL room status without needing a registration token.
   */
  async getGlobalStatus(): Promise<{ examStarted: boolean; roomStatus: string; v: number } | null> {
    const target = await this.getTarget();
    if (!target) return null;
    try {
      const res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(target)}/status`, {
            headers: { Accept: 'application/json' },
            signal,
          }),
        2500,
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    } catch {
      return null;
    }
  },

  /** Personal status check - used once student has a token */
  async getQuickStatus(token: string): Promise<{ s: string; ss: string; examStarted: boolean; roomStatus: string } | null> {
    const target = await this.getTarget();
    if (!target) return null;
    try {
      const res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(target)}/status?participation_token=${token}`, {
            headers: { Accept: 'application/json' },
            signal,
          }),
        2500,
      );
      if (!res.ok) return null;
      const json = await res.json();
      // Map new format to legacy if needed, or return new format
      const data = json.data;
      return {
        ...data,
        s: data.roomStatus,
        ss: data.myStatus
      };
    } catch {
      return null;
    }
  },

  /** Reachability probe for the Wi‑Fi gate: is the proctor phone answering? */
  async ping(target?: PeerTarget | PeerQrTarget): Promise<boolean> {
    const resolved = (target as PeerTarget | undefined) ?? (await this.getTarget());
    if (!resolved) return false;
    try {
      const res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(resolved)}/health`, { // Changed from /ping to /health
            headers: { Accept: 'application/json' },
            signal,
          }),
        4000,
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | undefined>;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const target = await this.getTarget();
    if (!target) {
      throw new Error('Not connected to a proctor phone. Scan the proctor QR again.');
    }
    if (__DEV__) {
      try {
        console.log("[LOBBY DEBUG] API URL:", `${baseUrl(target)}${path}`);
      } catch {}
    }

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value != null && value !== '') query.set(key, value);
    }
    const qs = query.toString() ? `?${query.toString()}` : '';

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      if (__DEV__) console.log(`[LAN DEBUG] Sending request to ${baseUrl(target)}${path}`);

      res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(target)}${path}${qs}`, {
            method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            signal,
          }),
        options.timeoutMs ?? 5000, // Reduced default timeout for faster failure detection
      );
    } catch (err) {
      if (__DEV__) console.error(`[LAN ERROR] Request failed: ${baseUrl(target)}${path}`, err);
      throw new Error(
        `Lost connection to the proctor phone (${target.host}). Stay on the same Wi‑Fi as the proctor and try again.`,
      );
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (err) {
      if (__DEV__) console.error(`[LAN ERROR] JSON Parse failed from ${target.host}:`, text.slice(0, 100));
      throw new Error(`Invalid response from proctor phone.`);
    }

    if (!res.ok || !json || json.success === false) {
      const msg = json?.message || `Request rejected (${res.status})`;
      if (__DEV__) console.error(`[LAN ERROR] rejected:`, msg);
      throw new Error(msg);
    }

    // Proctor server always wraps valid payloads in 'data'
    if (json.data === undefined) {
      return json as T;
    }

    return json.data as T;
  },
};

async function withTimeout(
  run: (signal: AbortSignal) => Promise<Response>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
