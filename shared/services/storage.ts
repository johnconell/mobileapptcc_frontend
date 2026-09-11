import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

/**
 * Cross-platform key/value storage.
 * SecureStore is unavailable on web; use localStorage there for local testing.
 */
export const appStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb) {
        return globalThis.localStorage?.getItem(key) ?? null;
      }
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      if (!globalThis.localStorage) {
        throw new Error('localStorage is not available in this browser.');
      }
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    try {
      if (isWeb) {
        globalThis.localStorage?.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // no-op on delete failures
    }
  },
};
