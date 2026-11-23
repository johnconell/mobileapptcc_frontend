/**
 * Thin service layer for side-effects that are not pure data access.
 * Repositories remain the source of domain data.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Crypto from 'expo-crypto';
import { appStorage } from '@/shared/services/storage';
import { debugEvent } from '@/shared/utils/debugDiagnostics';

const EXAM_KEEP_AWAKE_TAG = 'tcc-exam-session';
const DEVICE_ID_KEY = 'tcc.device.id';

export const DeviceService = {
  async enableExamKeepAwake() {
    try {
      await activateKeepAwakeAsync(EXAM_KEEP_AWAKE_TAG);
    } catch {
      // no-op on unsupported platforms
    }
  },

  disableExamKeepAwake() {
    try {
      deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG);
    } catch {
      // no-op
    }
  },

  async getDeviceId(): Promise<string> {
    try {
      let id = await appStorage.getItem(DEVICE_ID_KEY);
      const wasStored = Boolean(id);
      if (!id) {
        id = Crypto.randomUUID();
        await appStorage.setItem(DEVICE_ID_KEY, id);
      }
      debugEvent('device.identity', { available: true, source: wasStored ? 'stored' : 'created' });
      return id;
    } catch {
      debugEvent('device.identity_error');
      throw new Error('Unable to save this device identity. Check device storage, then try again.');
    }
  },
};
