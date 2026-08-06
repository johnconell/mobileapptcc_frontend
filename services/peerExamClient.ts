import { STORAGE_KEYS } from '@/constants';
import { PEER_PATH_PREFIX, PEER_PORT, type PeerQrTarget } from '@/services/peerExamServer';
import { appStorage } from '@/services/storage';

export type PeerTarget = {
  host: string;
  port: number;
  code: string;
  scheduleId: number | null;
  roomId: number | null;
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

  /** Reachability probe for the Wi‑Fi gate: is the proctor phone answering? */
  async ping(target?: PeerTarget | PeerQrTarget): Promise<boolean> {
    const resolved = (target as PeerTarget | undefined) ?? (await this.getTarget());
    if (!resolved) return false;
    try {
      const res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(resolved)}/ping`, {
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

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value != null && value !== '') query.set(key, value);
    }
    const qs = query.toString() ? `?${query.toString()}` : '';

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(target)}${path}${qs}`, {
            method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            signal,
          }),
        options.timeoutMs ?? 8000,
      );
    } catch {
      throw new Error(
        `Lost connection to the proctor phone (${target.host}). Stay on the same Wi‑Fi as the proctor and try again.`,
      );
    }

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      data?: T;
    };
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `Proctor phone rejected the request (${res.status}).`);
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
