import { STORAGE_KEYS } from '@/shared/constants';
import { isLoopbackApiHost, requiresLanApiHost } from '@/shared/services/apiReachability';
import { appStorage } from '@/shared/services/storage';

const DEFAULT_API_URL = 'https://metccapi.repohive.com/api/v1';
/** Must match server ADMIN_SYNC_TOKEN (same value as eas.json production env). */
const DEFAULT_SYNC_TOKEN = 'metcc-lan-sync-secret';

/** In-memory cache of LAN API override (exam-day campus server). */
let lanApiOverride: string | null | undefined;

function normalizeBase(url: string): string {
  let value = url.trim().replace(/\/$/, '');
  // Guard against .env typos like "10.x.x.x:8000/api/v1" (missing scheme).
  if (value && !/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  return value;
}

/**
 * Exam / lobby traffic:
 * - EXPO_PUBLIC_API_URL = default API (prefer cloud so login works without campus Wi‑Fi)
 * - Optional runtime LAN override via setLanApiUrl (proctor Find servers on exam day)
 */
export function getApiBaseUrl(): string {
  if (lanApiOverride) {
    return normalizeBase(lanApiOverride);
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  return normalizeBase(fromEnv || DEFAULT_API_URL);
}

/** Cloud / internet API for auth + pack download (does not require campus exam Wi‑Fi). */
export function getCloudApiBaseUrl(): string | null {
  const cloud = process.env.EXPO_PUBLIC_CLOUD_API_URL?.trim();
  const fallback = process.env.EXPO_PUBLIC_API_URL?.trim();
  const value = cloud || fallback || DEFAULT_API_URL;
  return value ? normalizeBase(value) : null;
}

/**
 * Sign-in always uses the cloud/internet API so a stale campus LAN override
 * (or a phone pointing at 127.0.0.1) cannot block proctor login on mobile data.
 */
export function getAuthApiBaseUrl(): string {
  return getCloudApiBaseUrl() || getApiBaseUrl();
}

/** Admin sync token for exam-day pack download + result upload. */
export function getSyncToken(): string {
  return process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim() || DEFAULT_SYNC_TOKEN;
}

/** Call once on app start so SecureStore override is applied. */
export async function hydrateApiBaseUrl(): Promise<string> {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;
  if (fromEnv.startsWith('https://')) {
    await appStorage.deleteItem(STORAGE_KEYS.lanApiUrl);
    lanApiOverride = null;
  } else {
    const stored = await appStorage.getItem(STORAGE_KEYS.lanApiUrl);
    lanApiOverride = stored && stored.trim() ? normalizeBase(stored) : null;
  }
  return getApiBaseUrl();
}

export async function setLanApiUrl(url: string): Promise<string> {
  const normalized = normalizeBase(url);
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('URL must start with http:// or https://');
  }
  await appStorage.setItem(STORAGE_KEYS.lanApiUrl, normalized);
  lanApiOverride = normalized;
  return normalized;
}

export async function clearLanApiUrl(): Promise<void> {
  await appStorage.deleteItem(STORAGE_KEYS.lanApiUrl);
  lanApiOverride = null;
}

export function hasLanApiOverride(): boolean {
  return Boolean(lanApiOverride);
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
  headers?: Record<string, string>;
  /** Override base URL (e.g. cloud for login). */
  baseUrl?: string;
};

async function readToken(): Promise<string | null> {
  return appStorage.getItem(STORAGE_KEYS.proctorToken);
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = normalizeBase(options.baseUrl || getApiBaseUrl());
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const useAuth = options.auth !== false;
  const token = options.token ?? (useAuth ? await readToken() : null);
  if (useAuth && !token) {
    throw new ApiError('Session expired. Please sign in again.', 401);
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const hint = lanApiOverride
      ? ' / campus Wi‑Fi and LAN IP'
      : isLoopbackApiHost(base) && requiresLanApiHost()
        ? ' — on a phone use your PC Wi‑Fi IP, not 127.0.0.1'
        : '';
    throw new ApiError(
      `Network error. Cannot reach server at ${base}. Check your connection${hint}.`,
      0,
    );
  }

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const looksLikeHtml =
      contentType.includes('text/html') ||
      (typeof text === 'string' &&
        /checking your browser|hcdn-cgi\/jschallenge|cf-browser-verification|just a moment/i.test(
          text,
        ));
    const message = looksLikeHtml
      ? 'Sign-in server is blocked by CDN bot protection (403). Disable Hostinger/hCDN JS challenge for metccapi.repohive.com API paths, then try again.'
      : json?.message ||
        (response.status === 401
          ? 'Session expired. Please sign in again.'
          : response.status === 403
            ? 'Access denied (403). Check that this account is an active proctor and the API is reachable.'
            : `Request failed (${response.status}).`);
    throw new ApiError(message, response.status, json ?? text);
  }

  return json as T;
}
