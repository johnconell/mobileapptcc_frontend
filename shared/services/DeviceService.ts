/**
 * Thin service layer for side-effects that are not pure data access.
 * Repositories remain the source of domain data.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const EXAM_KEEP_AWAKE_TAG = 'tcc-exam-session';

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
};
