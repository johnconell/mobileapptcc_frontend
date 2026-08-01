import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api/v1';

/** In-memory cache of LAN API override (Option B). */
let lanApiOverride: string | null | undefined;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/**
 * Option B:
 * - EXPO_PUBLIC_API_URL = default LAN exam server
 * - Optional runtime override via setLanApiUrl (proctor sets room PC IP)
 * - EXPO_PUBLIC_CLOUD_API_URL is documentation-only on the phone; cloud sync
 *   is performed by the LAN Laravel host (ADMIN_SYNC_*), not by the app.
 */
export function getApiBaseUrl(): string {
  if (lanApiOverride) {
    return normalizeBase(lanApiOverride);
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  return normalizeBase(fromEnv || DEFAULT_API_URL);
}

export function getCloudApiBaseUrl(): string | null {
  const cloud = process.env.EXPO_PUBLIC_CLOUD_API_URL?.trim();
  return cloud ? normalizeBase(cloud) : null;
}

/** Call once on app start so SecureStore override is applied. */
export async function hydrateApiBaseUrl(): Promise<string> {
  const stored = await appStorage.getItem(STORAGE_KEYS.lanApiUrl);
  lanApiOverride = stored && stored.trim() ? normalizeBase(stored) : null;
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
};

async function readToken(): Promise<string | null> {
  return appStorage.getItem(STORAGE_KEYS.proctorToken);
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
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
    throw new ApiError(
      `Network error. Cannot reach exam server at ${getApiBaseUrl()}. Check Wi‑Fi and LAN IP.`,
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
    const message =
      json?.message ||
      (response.status === 401
        ? 'Session expired. Please sign in again.'
        : `Request failed (${response.status}).`);
    throw new ApiError(message, response.status, json);
  }

  return json as T;
}
