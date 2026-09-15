import { STORAGE_KEYS } from '@/shared/constants';
import { ApiError, apiRequest, getAuthApiBaseUrl } from '@/shared/services/api';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { appStorage } from '@/shared/services/storage';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import type { AuthResult, ProctorProfile } from '@/shared/types';

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

/**
 * AuthRepository — online-only Laravel Sanctum proctor login.
 * Offline use starts after the logged-in proctor downloads an exam pack
 * (the pack stores this session so the phone can reopen later without internet).
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
      if (error instanceof ApiError) {
        const unreachable = error.status === 0;
        const host = getAuthApiBaseUrl();
        return {
          success: false,
          message: unreachable
            ? `Cannot reach the sign-in server (${host}). Check mobile data/Wi‑Fi, then try again.`
            : error.message,
        };
      }

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to reach the server. Check your internet connection and try again.',
      };
    }
  },

  async loginWithToken(token: string): Promise<AuthResult> {
    const trimmed = token.trim();
    if (!trimmed) {
      return { success: false, message: 'Google sign-in did not return a session.' };
    }
    try {
      const me = await apiRequest<{ success: boolean; data?: { profile: ProctorProfile } }>(
        '/proctor/me',
        { token: trimmed, baseUrl: getAuthApiBaseUrl() },
      );
      if (!me.data?.profile) {
        return { success: false, message: 'Google sign-in could not load your proctor profile.' };
      }
      await OfflineStore.setOfflineMode(false);
      return persistSession({ ...me.data.profile, offlineSession: false }, trimmed);
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Google sign-in failed. Connect to the internet and try again.',
      };
    }
  },

  /**
   * Fast synchronous-like storage check for app initialization.
   * Returns immediately without attempting any network requests (/proctor/me).
   */
  async getCachedSessionFast(): Promise<ProctorProfile | null> {
    try {
      const token = await appStorage.getItem(STORAGE_KEYS.proctorToken);
      const raw = await appStorage.getItem(STORAGE_KEYS.proctorSession);
      if (token && raw && token.trim() && raw.trim()) {
        return { ...(JSON.parse(raw) as ProctorProfile), token };
      }
      const bundled = await OfflineStore.getBundledProctorSession();
      if (bundled) {
        await persistSession(bundled, bundled.token);
        await OfflineStore.setOfflineMode(true);
        return bundled;
      }
      return null;
    } catch {
      return null;
    }
  },

  async getSession(): Promise<ProctorProfile | null> {
    try {
      const token = await appStorage.getItem(STORAGE_KEYS.proctorToken);
      const raw = await appStorage.getItem(STORAGE_KEYS.proctorSession);
      if (!token || !raw || !token.trim() || !raw.trim()) {
        const bundled = await OfflineStore.getBundledProctorSession();
        if (bundled) {
          await persistSession(bundled, bundled.token);
          await OfflineStore.setOfflineMode(true);
          return bundled;
        }
        return null;
      }

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

      // 1. Immediately delete all local credentials from storage FIRST
      await Promise.allSettled([
        appStorage.setItem(STORAGE_KEYS.proctorSession, ''),
        appStorage.setItem(STORAGE_KEYS.proctorToken, ''),
        appStorage.deleteItem(STORAGE_KEYS.proctorSession),
        appStorage.deleteItem(STORAGE_KEYS.proctorToken),
        appStorage.deleteItem('tcc.proctor.login_logs'),
        appStorage.deleteItem(STORAGE_KEYS.participationToken),
        appStorage.deleteItem(STORAGE_KEYS.examinationCode),
        appStorage.deleteItem(STORAGE_KEYS.studentProgress),
        appStorage.deleteItem(STORAGE_KEYS.examCheckpoint),
        appStorage.deleteItem('tcc.student.preload.ready'),
        OfflineStore.clearBundledProctorSession(),
        PeerExamClient.clear(),
      ]);

      // 2. Wipe all in-memory stores immediately
      useProctorStore.getState().reset();
      useStudentStore.getState().reset();
      useExamStore.getState().reset();
      useLobbyStore.getState().reset();

      // 3. Best-effort server invalidate with a 1000ms max race timeout (never hangs offline/LAN)
      if (token && !token.startsWith('offline-local-')) {
        try {
          const timer = new Promise((resolve) => setTimeout(resolve, 1000));
          await Promise.race([
            apiRequest('/proctor/logout', {
              method: 'POST',
              token,
              baseUrl: getAuthApiBaseUrl(),
            }).catch(() => undefined),
            timer,
          ]);
        } catch {
          // ignore network failure
        }
      }
    } catch {
      await appStorage.deleteItem(STORAGE_KEYS.proctorSession).catch(() => undefined);
      await appStorage.deleteItem(STORAGE_KEYS.proctorToken).catch(() => undefined);
      useProctorStore.getState().reset();
      useStudentStore.getState().reset();
      useExamStore.getState().reset();
      useLobbyStore.getState().reset();
    }
  },
};
