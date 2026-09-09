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
  async getGlobalStatus(): Promise<{
    examStarted: boolean;
    roomStatus: string;
    authorityStatus?: 'WAITING' | 'ACTIVE' | 'ENDED' | 'STARTING' | 'PAUSED';
    startSeq?: number;
    v: number;
  } | null> {
    const target = await this.getTarget();
    if (!target) return null;

    const normalize = (data: any) => {
      if (!data) return null;
      const authority = data.authorityStatus != null ? String(data.authorityStatus) : undefined;
      let roomStatus = String(data.roomStatus ?? data.status ?? '');
      if (!roomStatus && authority === 'ACTIVE') roomStatus = 'in_progress';
      if (!roomStatus && authority === 'ENDED') roomStatus = 'ended';
      if (!roomStatus) return null;
      return {
        examStarted: roomStatus === 'in_progress',
        roomStatus,
        authorityStatus: authority,
        startSeq: Number(data.startSeq ?? data.v ?? 0),
        v: Number(data.v ?? data.startSeq ?? 0),
      };
    };

    // POST first — expo-http-server GET often returns an empty 200 on phones.
    try {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      const data = await this.request<any>('/status', {
        method: 'POST',
        body: token ? { participation_token: token } : {},
        timeoutMs: 4000,
      });
      const parsed = normalize(data);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }

    try {
      const res = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(target)}/status`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: '{}',
            signal,
          }),
        4000,
      );
      const json = await res.json().catch(() => null);
      return normalize(json?.data ?? json);
    } catch {
      return null;
    }
  },

  /** Personal status check - used once student has a token */
  async getQuickStatus(token: string): Promise<{
    s: string;
    ss: string;
    examStarted: boolean;
    roomStatus: string;
    authorityStatus?: string;
    startPhase?: string;
    startSeq?: number;
  } | null> {
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
      const data = json?.data ?? json;
      if (!data) return null;
      const roomStatus = String(data.roomStatus ?? data.status ?? '');
      return {
        ...data,
        examStarted: roomStatus === 'in_progress',
        roomStatus,
        s: roomStatus,
        ss: data.myStatus,
        authorityStatus: data.authorityStatus,
        startPhase: data.startPhase,
        startSeq: Number(data.startSeq ?? 0),
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
          fetch(`${baseUrl(resolved)}/health`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: '{}',
            signal,
          }),
        4000,
      );
      if (res.ok) return true;
      const fallback = await withTimeout(
        (signal) =>
          fetch(`${baseUrl(resolved)}/health`, {
            headers: { Accept: 'application/json' },
            signal,
          }),
        4000,
      );
      return fallback.ok;
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
      throw new Error('Exam Pack Incomplete');
    }

    const hasUsablePayload =
      json &&
      json.success !== false &&
      (json.data != null || json.questions != null || json.registration_id != null);

    if (res.ok && hasUsablePayload) {
      return (json.data !== undefined ? json.data : json) as T;
    }

    const { classifyPeerStartupError } = await import('@/services/examReadiness');
    const rawMessage =
      (typeof json?.message === 'string' && json.message.trim()) ||
      (!json || !text ? '' : `Request rejected (${res.status})`);
    const msg = classifyPeerStartupError(rawMessage, path);
    if (__DEV__) {
      console.error(`[LAN ERROR] ${path} status=${res.status} body=${(text || '').slice(0, 180)} mapped=${msg}`);
    }
    throw new Error(msg);
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
