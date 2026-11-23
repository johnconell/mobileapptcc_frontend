import { Platform } from 'react-native';

const DEBUG_DIAGNOSTICS = process.env.EXPO_PUBLIC_DEBUG_DIAGNOSTICS === '1';

export function debugEvent(event: string, fields: Record<string, unknown> = {}) {
  if (!DEBUG_DIAGNOSTICS) return;
  console.info('[TCC-DIAG]', JSON.stringify({
    at: new Date().toISOString(),
    event,
    ...fields,
  }));
}

export async function logAppStart() {
  if (!DEBUG_DIAGNOSTICS) return;
  const [{ default: Constants }, Updates, FileSystem] = await Promise.all([
    import('expo-constants'),
    import('expo-updates'),
    import('expo-file-system/legacy'),
  ]);
  const freeStorageBytes = await FileSystem.getFreeDiskStorageAsync().catch(() => null);
  debugEvent('app.start', {
    manufacturer: Platform.OS === 'android' ? Platform.constants.Manufacturer : null,
    model: Platform.OS === 'android' ? Platform.constants.Model : null,
    osVersion: Platform.OS === 'android' ? Platform.constants.Release : String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? null,
    nativeBuildNumber:
      Constants.platform?.android?.versionCode ?? Constants.expoConfig?.android?.versionCode ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    channel: Updates.channel ?? null,
    freeStorageBytes,
    jsHeap: (() => {
      const memory = (globalThis.performance as typeof globalThis.performance & {
        memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number };
      } | undefined)?.memory;
      return memory
        ? { usedBytes: memory.usedJSHeapSize ?? null, totalBytes: memory.totalJSHeapSize ?? null }
        : null;
    })(),
  });
}
