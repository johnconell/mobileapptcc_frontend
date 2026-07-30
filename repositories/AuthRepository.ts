import { delay } from '@/utils';
import proctorsData from '@/mock/data/proctors.json';
import { STORAGE_KEYS } from '@/constants';
import type { AuthResult, ProctorAccount, ProctorProfile } from '@/types';
import * as SecureStore from 'expo-secure-store';

/**
 * AuthRepository — mock credentials today.
 * Future Laravel: POST /api/proctor/login
 */
export const AuthRepository = {
  async login(username: string, password: string): Promise<AuthResult> {
    await delay(500);
    const account = (proctorsData as ProctorAccount[]).find(
      (item) =>
        item.username.toLowerCase() === username.trim().toLowerCase() &&
        item.password === password,
    );

    if (!account) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const profile: ProctorProfile = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      roleLabel: 'Examination Proctor',
    };

    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.proctorSession, JSON.stringify(profile));
    } catch {
      // SecureStore may be unavailable on some targets
    }

    return { success: true, profile };
  },

  async getSession(): Promise<ProctorProfile | null> {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.proctorSession);
      if (!raw) return null;
      return JSON.parse(raw) as ProctorProfile;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.proctorSession);
    } catch {
      // no-op
    }
  },
};
