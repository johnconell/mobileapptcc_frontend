import { STORAGE_KEYS } from '@/constants';
import { ApiError, apiRequest, getAuthApiBaseUrl } from '@/services/api';
import { OfflineStore } from '@/services/offlineStore';
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

/**
 * AuthRepository — Laravel Sanctum proctor login.
 * Uses the cloud/internet API so login works without campus exam Wi‑Fi.
 * POST /api/v1/proctor/login
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

      const stored: ProctorProfile = { ...profile, token };
      await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(stored));
      await appStorage.setItem(STORAGE_KEYS.proctorToken, token);

      // Confirm token persisted before continuing.
      const verified = await appStorage.getItem(STORAGE_KEYS.proctorToken);
      if (verified !== token) {
        return {
          success: false,
          message: 'Could not save your session. Please try again.',
        };
      }

      // Avoid student participation tokens stealing proctor lobby polls.
      await appStorage.deleteItem(STORAGE_KEYS.participationToken);
      await appStorage.deleteItem(STORAGE_KEYS.examinationCode);
      await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
      // Clear sticky offline mode left over from a previous pack download.
      await OfflineStore.setOfflineMode(false);

      return { success: true, profile: stored, token };
    } catch (error) {
      if (error instanceof ApiError) {
        return { success: false, message: error.message };
      }
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

      try {
        const me = await apiRequest<{ success: boolean; data?: { profile: ProctorProfile } }>(
          '/proctor/me',
          { token, baseUrl: getAuthApiBaseUrl() },
        );
        if (me.data?.profile) {
          const profile = { ...me.data.profile, token };
          await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(profile));
          return profile;
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // Only clear session if this token is still the active one
          // (avoids wiping a brand-new login during an in-flight /me race).
          const current = await appStorage.getItem(STORAGE_KEYS.proctorToken);
          if (current === token) {
            await this.logout();
          }
          return null;
        }
      }

      return { ...(JSON.parse(raw) as ProctorProfile), token };
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
      if (token) {
        await apiRequest('/proctor/logout', {
          method: 'POST',
          token,
          baseUrl: getAuthApiBaseUrl(),
        }).catch(() => undefined);
      }
    } finally {
      await appStorage.deleteItem(STORAGE_KEYS.proctorSession);
      await appStorage.deleteItem(STORAGE_KEYS.proctorToken);
    }
  },
};
