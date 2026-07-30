import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api/v1';

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  return (fromEnv || DEFAULT_API_URL).replace(/\/$/, '');
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
    throw new ApiError('Network error. Check your connection and API URL.', 0);
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
