import { Platform } from 'react-native';
import { isExamLocked, stopExamLock } from './ExamSecurityService';
import {
  readGuidedAccessStatus,
  requestAutonomousSingleAppMode,
  type GuidedAccessStatus,
} from './guidedAccess';

export async function releaseGuidedAccessForExam(
  request: (enabled: boolean) => Promise<boolean> = requestAutonomousSingleAppMode,
  readStatus: () => GuidedAccessStatus = readGuidedAccessStatus,
): Promise<void> {
  if (readStatus() !== 'enabled') return;

  const released = await request(false);
  const status = readStatus();
  if (status === 'disabled') return;
  if (status === 'enabled') {
    throw new Error(
      released
        ? 'Guided Access is still active. End it using the iOS accessibility shortcut before leaving the examination.'
        : 'This iOS device could not end Guided Access automatically. Use the iOS accessibility shortcut to exit Guided Access.',
    );
  }
  throw new Error('Guided Access could not be verified as disabled. Ask the proctor for assistance.');
}

export type ExamRestrictionReleaseReason =
  | 'lobby_exit'
  | 'exam_exit'
  | 'submission_confirmed'
  | 'session_ended';

/**
 * Releases only app-owned examination restrictions. Android may still show an
 * OS unlock screen when the device owner enabled "lock device on unpin"; the
 * app never invokes a device-lock or keyguard API.
 */
export async function releaseExamSessionRestrictions(
  _reason: ExamRestrictionReleaseReason,
  releaseLock: () => Promise<void> = stopExamLock,
  readLockState: () => Promise<boolean> = isExamLocked,
): Promise<void> {
  if (Platform.OS === 'ios') {
    await releaseGuidedAccessForExam();
    return;
  }

  await releaseLock();
  if (!(await readLockState())) return;

  // Some Android builds report the state change one activity frame later.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await releaseLock();
  if (await readLockState()) {
    throw new Error(
      'Android screen pinning is still active. Use the system unpin gesture before joining another examination.',
    );
  }
}
