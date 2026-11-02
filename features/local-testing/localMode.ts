import { STORAGE_KEYS } from '@/shared/constants';

export const LOCAL_FIXTURE_VERSION = '2026.11.02-4';

export function isLocalApiMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true &&
    process.env.EXPO_PUBLIC_LOCAL_API_MODE === 'true';
}

export function authStorageKeys() {
  return isLocalApiMode()
    ? { token: STORAGE_KEYS.localProctorToken, session: STORAGE_KEYS.localProctorSession }
    : { token: STORAGE_KEYS.proctorToken, session: STORAGE_KEYS.proctorSession };
}

