import { OfflineExamRepository } from '@/services/offlineExamRepository';
import { OfflineStore } from '@/services/offlineStore';
import { ProctorAuthCache } from '@/services/proctorAuthCache';

export type PackProgress = { percent: number; label: string };

export type EnsurePackResult = {
  ok: boolean;
  message: string;
  fromCache: boolean;
  authAccountsCached?: number;
};

/**
 * Download / refresh the offline exam pack from the configured API.
 * Used after proctor login and before a student joins an offline exam.
 *
 * includeAuth: also cache proctor bcrypt hashes for offline login (proctor phones).
 */
export async function ensureExamPackCached(options?: {
  force?: boolean;
  includeAuth?: boolean;
  onProgress?: (progress: PackProgress) => void;
}): Promise<EnsurePackResult> {
  const force = options?.force ?? true;
  const includeAuth = options?.includeAuth ?? false;
  const meta = await OfflineStore.getPackMeta();
  const hasAuth = await ProctorAuthCache.hasAccounts();

  if (!force && meta.ready && (!includeAuth || hasAuth)) {
    options?.onProgress?.({ percent: 100, label: 'Already on this phone' });
    return {
      ok: true,
      message: 'Exam cache already on this device.',
      fromCache: true,
    };
  }

  try {
    await OfflineExamRepository.downloadPackFromCloud(undefined, {
      includeAuth,
      onProgress: options?.onProgress,
    });
    const authCount = includeAuth ? (await ProctorAuthCache.list()).length : undefined;
    return {
      ok: true,
      message: includeAuth
        ? `Exam cache updated. ${authCount ?? 0} proctor account(s) ready for offline login.`
        : 'Exam schedules and questions updated on this device.',
      fromCache: false,
      authAccountsCached: authCount,
    };
  } catch (error) {
    if (meta.ready) {
      return {
        ok: true,
        message:
          error instanceof Error
            ? `Using last saved cache (${error.message})`
            : 'Using last saved cache (server unreachable).',
        fromCache: true,
      };
    }
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Could not download exam data. Check connection and try again.',
      fromCache: false,
    };
  }
}
