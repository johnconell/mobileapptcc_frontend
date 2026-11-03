import { STORAGE_KEYS } from '@/shared/constants';
import { assertSecureApiBase } from '@/shared/services/apiReachability';
import { PEER_PATH_PREFIX, PEER_PORT, type PeerQrTarget } from '@/features/examinations/services/peerExamServer';
import { appStorage } from '@/shared/services/storage';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { bytesToHex } from '@noble/ciphers/utils.js';
import {
  assertPeerCiphertextContext,
  completePeerClientHandshake,
  createPeerIdentity,
  decryptPeerPayload,
  encryptPeerPayload,
  type PeerCiphertext,
  type PeerHandshakeResponse,
} from '@/features/examinations/services/peerTransportCrypto';

export type PeerTarget = {
  host: string;
  port: number;
  code: string;
  scheduleId: number | null;
  roomId: number | null;
  wifiSsid: string | null;
  peerPublicKey: string;
};

let cached: PeerTarget | null | undefined;
let channel: {
  endpoint: string;
  identityKey: string;
  sessionId: string;
  key: Uint8Array;
  sequence: number;
} | null = null;
let requestQueue: Promise<void> = Promise.resolve();

function baseUrl(target: PeerTarget): string {
  return `http://${target.host}:${target.port}${PEER_PATH_PREFIX}`;
}

function normalizeTarget(target: PeerTarget | PeerQrTarget): PeerTarget {
  return {
    host: target.host,
    port: target.port || PEER_PORT,
    code: target.code,
    scheduleId: target.scheduleId ?? null,
    roomId: target.roomId ?? null,
    wifiSsid: target.wifiSsid ?? null,
    peerPublicKey: target.peerPublicKey,
  };
}

async function randomHex(byteLength: number): Promise<string> {
  return bytesToHex(await Crypto.getRandomBytesAsync(byteLength));
}

async function secureChannelFor(target: PeerTarget) {
  const endpoint = baseUrl(target);
  if (
    channel &&
    channel.endpoint === endpoint &&
    channel.identityKey === target.peerPublicKey
  ) {
    return channel;
  }

  const clientPrivateKey = await randomHex(32);
  const clientPublicKey = createPeerIdentity(clientPrivateKey).publicKey;
  const clientNonce = await randomHex(16);
  const response = await withTimeout(
    (signal) =>
      fetch(`${endpoint}/handshake`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_public_key: clientPublicKey,
          client_nonce: clientNonce,
        }),
        signal,
      }),
    4000,
  );
  const json = await response.json().catch(() => null);
  const handshake = json?.data ?? json;
  if (!response.ok || json?.success === false || !handshake?.session_id) {
    throw new Error(handshake?.message || 'Could not establish a secure session with the proctor.');
  }

  const key = completePeerClientHandshake({
    identityPublicKey: target.peerPublicKey,
    clientPrivateKey,
    clientPublicKey,
    clientNonce,
    response: handshake as PeerHandshakeResponse,
  });
  channel = {
    endpoint,
    identityKey: target.peerPublicKey,
    sessionId: String(handshake.session_id),
    key,
    sequence: 0,
  };
  return channel;
}

async function performSecureRequest<T>(
  target: PeerTarget,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
    timeoutMs?: number;
  },
): Promise<T> {
  const method = (options.method ?? (options.body !== undefined ? 'POST' : 'GET')).toUpperCase();
  const peerPath = `${PEER_PATH_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  const query = Object.fromEntries(
    Object.entries(options.query ?? {}).filter((entry): entry is [string, string] =>
      entry[1] != null && entry[1] !== '',
    ),
  );
  const activeChannel = await secureChannelFor(target);
  const sequence = activeChannel.sequence + 1;
  activeChannel.sequence = sequence;
  const message = encryptPeerPayload(
    activeChannel.key,
    activeChannel.sessionId,
    sequence,
    'POST',
    `${PEER_PATH_PREFIX}/secure`,
    { path: peerPath, method, query, body: options.body },
    await randomHex(12),
  );

  try {
    const response = await withTimeout(
      (signal) =>
        fetch(`${baseUrl(target)}/secure`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          signal,
        }),
      options.timeoutMs ?? 5000,
    );
    const outer = await response.json().catch(() => null);
    if (!response.ok || !outer?.ciphertext) {
      channel = null;
      throw new Error(outer?.message || `Secure peer request failed (${response.status}).`);
    }

    assertPeerCiphertextContext(
      outer as PeerCiphertext,
      activeChannel.sessionId,
      sequence,
    );
    const result = decryptPeerPayload<{ status: number; body: string }>(
      activeChannel.key,
      outer as PeerCiphertext,
      method,
      peerPath,
    );
    let json: any;
    try {
      json = result.body ? JSON.parse(result.body) : null;
    } catch {
      throw new Error('The proctor returned an invalid secure response.');
    }
    if (result.status < 200 || result.status >= 300 || json?.success === false) {
      const { classifyPeerStartupError } = await import('@/features/examinations/services/examReadiness');
      const rawMessage =
        (typeof json?.message === 'string' && json.message.trim()) ||
        `Request rejected (${result.status})`;
      const err = new Error(classifyPeerStartupError(rawMessage, path));
      (err as any).status = result.status;
      (err as any).statusCode = result.status;
      throw err;
    }
    return (json?.data !== undefined ? json.data : json) as T;
  } catch (error) {
    if (channel === activeChannel) channel = null;
    throw error;
  }
}

function queuedSecureRequest<T>(
  target: PeerTarget,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
    timeoutMs?: number;
  },
): Promise<T> {
  const operation = requestQueue.then(() => performSecureRequest<T>(target, path, options));
  requestQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

/**
 * PeerExamClient — student side of peer mode. The proctor phone hosts the exam
 * over the local Wi‑Fi, so every request here goes to that phone, not Laravel.
 */
export const PeerExamClient = {
  async setTarget(target: PeerQrTarget): Promise<void> {
    if (!/^[0-9a-f]{64}$/i.test(target.peerPublicKey)) {
      throw new Error('This room QR has no secure proctor identity. Scan the current proctor QR code.');
    }
    const value: PeerTarget = {
      host: target.host,
      port: target.port || PEER_PORT,
      code: target.code,
      scheduleId: target.scheduleId ?? null,
      roomId: target.roomId ?? null,
      wifiSsid: target.wifiSsid ?? null,
      peerPublicKey: target.peerPublicKey.toLowerCase(),
    };
    if (
      !cached ||
      baseUrl(cached) !== baseUrl(value) ||
      cached.peerPublicKey !== value.peerPublicKey
    ) {
      channel = null;
    }
    cached = value;
    await appStorage.setItem(STORAGE_KEYS.peerTarget, JSON.stringify(value));
    if (__DEV__) {
      console.log('[PEER JOIN] QR target accepted', {
        qrIp: value.host,
        port: value.port,
        baseUrl: baseUrl(value),
      });
    }
  },

  async getTarget(): Promise<PeerTarget | null> {
    if (cached !== undefined) return cached;
    const raw = await appStorage.getItem(STORAGE_KEYS.peerTarget);
    if (!raw) {
      cached = null;
      return null;
    }
    try {
      const restored = JSON.parse(raw) as PeerTarget;
      cached = /^[0-9a-f]{64}$/i.test(restored.peerPublicKey ?? '') ? restored : null;
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
    channel = null;
    await appStorage.deleteItem(STORAGE_KEYS.peerTarget);
  },

  /**
   * Fetch the latest proctor LAN IP from the cloud exam/resolve endpoint and
   * update the cached peer target. Call before connect and on reconnect retry.
   */
  async refreshHostFromCloud(examCode?: string): Promise<boolean> {
    const current = await this.getTarget();
    if (!current?.peerPublicKey) return false;
    const code = (examCode || current?.code || '').trim().toUpperCase();
    if (!code) return false;
    if (__DEV__) {
      console.info('[RECONNECT TRACE] refresh saved peer target', {
        savedPeerHost: current?.host ?? null,
        savedPeerPort: current?.port ?? null,
      });
    }

    try {
      const Network = await import('expo-network');
      const netState = await Network.getNetworkStateAsync().catch(() => null);
      if (netState?.isConnected === false || netState?.isInternetReachable === false) {
        return false;
      }
    } catch {
      // continue
    }

    try {
      const { getCloudApiBaseUrl, getApiBaseUrl } = await import('@/shared/services/api');
      const base = getCloudApiBaseUrl() || getApiBaseUrl();
      assertSecureApiBase(base);
      const res = await withTimeout(
        (signal) =>
          fetch(`${base}/exam/resolve`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
            signal,
          }),
        3000,
      );
      if (!res.ok) return false;
      const json = await res.json().catch(() => null);
      if (!json || json.valid === false) return false;

      const host = String(
        json.local_server_ip ??
          json.localServerIp ??
          json.session?.localServerIp ??
          json.data?.session?.localServerIp ??
          '',
      ).trim();
      if (!host || host === '0.0.0.0') return false;

      const port =
        Number(json.peer_port ?? json.peerPort ?? current?.port) || PEER_PORT;
      const wifiSsid =
        (json.wifi_ssid ?? json.wifiSsid ?? json.session?.wifiSsid ?? current?.wifiSsid) != null
          ? String(json.wifi_ssid ?? json.wifiSsid ?? json.session?.wifiSsid ?? current?.wifiSsid)
          : null;
      const nextCode = String(json.examinationCode ?? code).trim().toUpperCase() || code;
      const reportedIdentity = String(
        json.peer_identity_public_key ??
          json.peerIdentityPublicKey ??
          json.session?.peerIdentityPublicKey ??
          json.data?.session?.peerIdentityPublicKey ??
          '',
      ).trim().toLowerCase();
      const peerPublicKey = current?.peerPublicKey;
      if (!peerPublicKey || (reportedIdentity && reportedIdentity !== peerPublicKey)) return false;

      await this.setTarget({
        host,
        port,
        code: nextCode,
        scheduleId: current?.scheduleId ?? null,
        roomId: current?.roomId ?? null,
        wifiSsid,
        peerPublicKey,
      });
      return true;
    } catch (err) {
      if (__DEV__) console.warn('[PeerExamClient] refreshHostFromCloud failed:', err);
      return false;
    }
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
    if (!(await this.getTarget())) return null;

    const normalize = (data: any) => {
      if (!data) return null;
            const authority: 'WAITING' | 'ACTIVE' | 'ENDED' | 'STARTING' | 'PAUSED' | undefined =
        (['WAITING', 'ACTIVE', 'ENDED', 'STARTING', 'PAUSED'] as const).includes(data.authorityStatus)
          ? data.authorityStatus
          : undefined;
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

    try {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      const data = await this.request<Record<string, any>>('/status', {
        method: 'POST',
        body: token ? { participation_token: token } : {},
        timeoutMs: 4000,
      });
      const parsed = normalize(data);
      if (parsed) return parsed;
    } catch {
      return null;
    }
    return null;
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
    if (!(await this.getTarget())) return null;
    try {
      const data = await this.request<Record<string, any>>('/status', {
        method: 'GET',
        query: { participation_token: token },
        timeoutMs: 2500,
      });
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
    const resolved = target ? normalizeTarget(target) : await this.getTarget();
    if (!resolved) return false;
    try {
      await queuedSecureRequest(resolved, '/health', {
        method: 'POST',
        body: {},
        timeoutMs: 4000,
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Lightweight health check used by resume: distinguish a live session from
   * an idle/closed proctor host (exam already ended).
   */
  async probeHealth(
    target?: PeerTarget | PeerQrTarget,
  ): Promise<'ready' | 'idle' | 'ended' | 'unreachable'> {
    const resolved = target ? normalizeTarget(target) : await this.getTarget();
    if (!resolved) return 'unreachable';
    try {
      if (__DEV__) {
        console.log('[PEER JOIN] health check', {
          baseUrl: `${baseUrl(resolved)}/health`,
          qrIp: resolved.host,
        });
      }
      const data = await queuedSecureRequest<Record<string, unknown>>(resolved, '/health', {
        method: 'POST',
        body: {},
        timeoutMs: 4000,
      });
      if (__DEV__) {
        console.log('[PEER JOIN] health response', {
          qrIp: resolved.host,
          status: 'secure',
          ok: true,
        });
      }
      const sessionStatus = String(data?.session_status ?? '').toLowerCase();
      const status = String(data?.status ?? '').toLowerCase();
      if (sessionStatus === 'ended' || status === 'ended') return 'ended';
      if (status === 'idle' || !sessionStatus || sessionStatus === 'null') return 'idle';
      return 'ready';
    } catch (err) {
      if (__DEV__) {
        console.warn('[PEER JOIN] health transport error', {
          qrIp: resolved.host,
          errorType: err instanceof Error ? err.name : typeof err,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return 'unreachable';
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
    try {
      return await queuedSecureRequest<T>(target, path, options);
    } catch (error) {
        const isTimeout =
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'));
        if (isTimeout) {
          throw new Error('Connection to the proctor phone timed out. Please check your Wi-Fi signal.');
        }
        if (error instanceof TypeError && Platform.OS === 'ios') {
          throw new Error(
            'Cannot reach the proctor phone. Ensure you are on exam Wi-Fi and have allowed Local Network access in iOS Settings.',
          );
        }
        if (error instanceof TypeError) {
          throw new Error('Cannot reach the proctor. Check the exam Wi-Fi and device-to-device access.');
        }
        throw error;
    }
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
