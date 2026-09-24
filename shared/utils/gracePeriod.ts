import {
  DEFAULT_DISCONNECT_GRACE_SECONDS,
  DEFAULT_TAB_SWITCH_GRACE_SECONDS,
  STORAGE_KEYS,
} from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';

const RUNTIME_KEY = `${STORAGE_KEYS.settings}.disconnect_grace_seconds`;
const TAB_SWITCH_KEY = `${STORAGE_KEYS.settings}.tab_switch_grace_seconds`;

export function clampDisconnectGraceSeconds(value: unknown): number {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 10 && n <= 1800) return n;
  return DEFAULT_DISCONNECT_GRACE_SECONDS;
}

/** Persist grace period received from pack download or proctor handshake. */
export async function persistDisconnectGraceSeconds(value: unknown): Promise<void> {
  await appStorage.setItem(RUNTIME_KEY, String(clampDisconnectGraceSeconds(value)));
}

/**
 * Resolve the active Wi-Fi disconnection grace period (seconds).
 * Prefers the offline pack (configured by admin in examination settings),
 * then cached runtime value from peer proctor handshake, then default (120s).
 */
export async function resolveDisconnectGraceSeconds(): Promise<number> {
  try {
    const pack = await OfflineStore.getPack();
    if (pack?.examination_settings?.disconnect_grace_seconds != null) {
      const fromPack = clampDisconnectGraceSeconds(pack.examination_settings.disconnect_grace_seconds);
      await appStorage.setItem(RUNTIME_KEY, String(fromPack));
      return fromPack;
    }
  } catch {
    // fall through
  }

  const cached = await appStorage.getItem(RUNTIME_KEY);
  if (cached != null && cached !== '') {
    return clampDisconnectGraceSeconds(cached);
  }

  return DEFAULT_DISCONNECT_GRACE_SECONDS;
}

export function clampTabSwitchGraceSeconds(_value?: unknown): number {
  return 0;
}

/** Tab switch grace period disabled: mandatory screen pinning is active */
export async function persistTabSwitchGraceSeconds(_value?: unknown): Promise<void> {
  // No-op
}

export async function resolveTabSwitchGraceSeconds(): Promise<number> {
  return 0;
}

