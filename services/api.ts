import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api/v1';

/** In-memory cache of LAN API override (exam-day campus server). */
let lanApiOverride: string | null | undefined;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '');
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
  return cloud ? normalizeBase(cloud) : null;
}

/**
 * Prefer cloud for sign-in so proctors can log in on mobile data / home Wi‑Fi.
 * If a campus LAN exam server override is active, auth uses that host instead
 * (same Sanctum token as lobby/exam traffic).
 */
export function getAuthApiBaseUrl(): string {
  if (lanApiOverride) {
    return getApiBaseUrl();
  }
  return getCloudApiBaseUrl() || getApiBaseUrl();
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
    throw new ApiError(
      `Network error. Cannot reach server at ${base}. Check your connection${
        options.baseUrl || !lanApiOverride ? '' : ' / campus Wi‑Fi and LAN IP'
      }.`,
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
