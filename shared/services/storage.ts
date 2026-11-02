import { Platform } from 'react-native';
import { isLocalApiMode } from '@/features/local-testing/localMode';

const isWeb = Platform.OS === 'web';
const storageKey = (key: string) => isLocalApiMode() && !key.startsWith('tcc.local-api.')
  ? `tcc.local-api.${key}`
  : key;

let secureStoreModule: typeof import('expo-secure-store') | null = null;
async function getSecureStore() {
  if (!secureStoreModule && !isWeb) {
    try {
      secureStoreModule = await import('expo-secure-store');
    } catch {
      secureStoreModule = null;
    }
  }
  return secureStoreModule;
}

const memoryStore = new Map<string, string>();

/**
 * Cross-platform key/value storage.
 * SecureStore is unavailable on web and test runners; uses localStorage or memory fallback there.
 */
export const appStorage = {
  async getItem(key: string): Promise<string | null> {
    key = storageKey(key);
    try {
      if (isWeb) {
        if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
          return globalThis.localStorage.getItem(key) ?? null;
        }
        return memoryStore.get(key) ?? null;
      }
      const ss = await getSecureStore();
      if (ss) {
        return await ss.getItemAsync(key);
      }
      return memoryStore.get(key) ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    key = storageKey(key);
    if (isWeb) {
      if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
        globalThis.localStorage.setItem(key, value);
        return;
      }
      memoryStore.set(key, value);
      return;
    }
    const ss = await getSecureStore();
    if (ss) {
      await ss.setItemAsync(key, value);
      return;
    }
    memoryStore.set(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    key = storageKey(key);
    try {
      if (isWeb) {
        if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
          globalThis.localStorage.removeItem(key);
          return;
        }
        memoryStore.delete(key);
        return;
      }
      const ss = await getSecureStore();
      if (ss) {
        await ss.deleteItemAsync(key);
        return;
      }
      memoryStore.delete(key);
    } catch {
      // no-op on delete failures
    }
  },
};
