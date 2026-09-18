import { MAX_EXAM_VIOLATIONS, STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';

const RUNTIME_KEY = `${STORAGE_KEYS.settings}.violation_limit`;

export function clampViolationLimit(value: unknown): number {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 20) return n;
  return MAX_EXAM_VIOLATIONS;
}

/** Persist limit received from pack download / peer package handshake. */
export async function persistViolationLimit(value: unknown): Promise<void> {
  await appStorage.setItem(RUNTIME_KEY, String(clampViolationLimit(value)));
}

/**
 * Resolve the active auto-warn / auto-submit violation threshold.
 * Prefer the offline pack (admin setting from last sync), then runtime
 * value from peer package handshake, then default.
 */
export async function resolveViolationLimit(): Promise<number> {
  try {
    const pack = await OfflineStore.getPack();
    if (pack?.examination_settings?.violation_limit != null) {
      const fromPack = clampViolationLimit(pack.examination_settings.violation_limit);
      // Keep runtime cache aligned so student/proctor UIs stay consistent.
      await appStorage.setItem(RUNTIME_KEY, String(fromPack));
      return fromPack;
    }
  } catch {
    // fall through
  }

  const cached = await appStorage.getItem(RUNTIME_KEY);
  if (cached != null && cached !== '') {
    return clampViolationLimit(cached);
  }

  return MAX_EXAM_VIOLATIONS;
}
