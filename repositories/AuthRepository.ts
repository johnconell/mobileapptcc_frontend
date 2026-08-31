import { STORAGE_KEYS } from '@/constants';
import { ApiError, apiRequest, getAuthApiBaseUrl } from '@/services/api';
import { OfflineStore } from '@/services/offlineStore';
import { PeerExamClient } from '@/services/peerExamClient';
import { ProctorAuthCache } from '@/services/proctorAuthCache';
import { appStorage } from '@/services/storage';
import type { AuthResult, ProctorProfile } from '@/types';

type LoginResponse = {
  success: boolean;
  message?: string;
  data?: {
    token: string;
    profile: ProctorProfile;
    user?: unknown;
  };
};

async function persistSession(profile: ProctorProfile, token: string): Promise<AuthResult> {
  const stored: ProctorProfile = { ...profile, token };
  await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(stored));
  await appStorage.setItem(STORAGE_KEYS.proctorToken, token);

  const verified = await appStorage.getItem(STORAGE_KEYS.proctorToken);
  if (verified !== token) {
    return {
      success: false,
      message: 'Could not save your session. Please try again.',
    };
  }

  await appStorage.deleteItem(STORAGE_KEYS.participationToken);
  await appStorage.deleteItem(STORAGE_KEYS.examinationCode);
  await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
  await PeerExamClient.clear(); // Role transition: clear any student peer target on Proctor login

  return { success: true, profile: stored, token };
}

async function loginOffline(username: string, password: string): Promise<AuthResult> {
  const account = await ProctorAuthCache.verify(username, password);
  if (!account) {
    const hasCache = await ProctorAuthCache.hasAccounts();
    return {
      success: false,
      message: hasCache
        ? 'Invalid email or password (offline cache).'
        : 'No internet and no proctor accounts cached on this phone. Connect online once to download accounts, then try again.',
    };
  }

  const token = `offline-local-${account.id}`;
  const profile: ProctorProfile = {
    id: String(account.id),
    username: account.email,
    displayName: account.name,
    roleLabel: 'Proctor',
    token,
    offlineSession: true,
  };

  // Offline session works against the local exam pack only.
  await OfflineStore.setOfflineMode(true);
  return persistSession(profile, token);
}

/**
 * AuthRepository — Laravel Sanctum proctor login, with offline cache fallback.
 * Online: POST /api/v1/proctor/login
 * Offline: verify email/password against SecureStore bcrypt cache from exam pack.
 */
export const AuthRepository = {
  async login(username: string, password: string): Promise<AuthResult> {
    try {
      const json = await apiRequest<LoginResponse>('/proctor/login', {
        method: 'POST',
        auth: false,
        baseUrl: getAuthApiBaseUrl(),
        body: {
          email: username.trim(),
          username: username.trim(),
          password,
        },
      });

      const profile = json.data?.profile;
      const token = json.data?.token;
      if (!profile || !token) {
        return { success: false, message: json.message || 'Login failed.' };
      }

      await OfflineStore.setOfflineMode(false);
      return persistSession({ ...profile, offlineSession: false }, token);
    } catch (error) {
      // Network / unreachable server → try local proctor auth cache.
      const isNetwork =
        error instanceof ApiError
          ? error.status === 0
          : error instanceof Error &&
            /network|reach|Failed to fetch|Aborted|timeout/i.test(error.message);

      if (isNetwork || (error instanceof ApiError && error.status === 0)) {
        return loginOffline(username, password);
      }

      if (error instanceof ApiError) {
        // Wrong password online should not fall through to offline (could confuse).
        // Only fall back offline when server is unreachable.
        return { success: false, message: error.message };
      }

      // Unknown errors: attempt offline as last resort.
      const offline = await loginOffline(username, password);
      if (offline.success) return offline;

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to reach the server. Check EXPO_PUBLIC_CLOUD_API_URL.',
      };
    }
  },

  async getSession(): Promise<ProctorProfile | null> {
    try {
      const token = await appStorage.getItem(STORAGE_KEYS.proctorToken);
      const raw = await appStorage.getItem(STORAGE_KEYS.proctorSession);
      if (!token || !raw) return null;

      const cached = { ...(JSON.parse(raw) as ProctorProfile), token };

      // Local offline session — never call /proctor/me.
      if (cached.offlineSession || token.startsWith('offline-local-')) {
        return { ...cached, offlineSession: true };
      }

      try {
        const me = await apiRequest<{ success: boolean; data?: { profile: ProctorProfile } }>(
          '/proctor/me',
          { token, baseUrl: getAuthApiBaseUrl() },
        );
        if (me.data?.profile) {
          const profile = { ...me.data.profile, token, offlineSession: false };
          await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(profile));
          return profile;
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          const current = await appStorage.getItem(STORAGE_KEYS.proctorToken);
          if (current === token) {
            await this.logout();
          }
          return null;
        }
      }

      return cached;
    } catch {
      return null;
    }
  },

  async hasToken(): Promise<boolean> {
    const token = await appStorage.getItem(STORAGE_KEYS.proctorToken);
    return Boolean(token);
  },

  async logout(): Promise<void> {
    try {
      const token = await appStorage.getItem(STORAGE_KEYS.proctorToken);
      if (token && !token.startsWith('offline-local-')) {
        await apiRequest('/proctor/logout', {
          method: 'POST',
          token,
          baseUrl: getAuthApiBaseUrl(),
        }).catch(() => undefined);
      }
    } finally {
      await appStorage.deleteItem(STORAGE_KEYS.proctorSession);
      await appStorage.deleteItem(STORAGE_KEYS.proctorToken);
      await PeerExamClient.clear();
    }
  },
};
