import { normalizePasskey } from './passkeyFormat';

export type OfflinePasskeyEligibilityRegistration = {
  id?: number;
  examination_schedule_id?: number;
  exam_passkey?: string | null;
  exam_passkey_hash?: string | null;
  passkey_status?: string | null;
  passkey_expires_at?: string | null;
  result_status?: string | null;
};

export function matchOfflinePasskeyRegistrations<T extends OfflinePasskeyEligibilityRegistration>(
  registrations: T[],
  normalizedPasskey: string,
  normalizedHash: string,
): T[] {
  return registrations.filter((registration) => {
    const storedHash = String(registration.exam_passkey_hash || '').toLowerCase();
    if (storedHash) return storedHash === normalizedHash.toLowerCase();
    return normalizePasskey(registration.exam_passkey) === normalizePasskey(normalizedPasskey);
  });
}

export function selectOfflinePasskeyRegistration<T extends OfflinePasskeyEligibilityRegistration>(
  matches: T[],
  scheduleId: number,
): T | undefined {
  return matches.find(
    (registration) => Number(registration.examination_schedule_id) === scheduleId,
  );
}

export type OfflinePasskeyEligibility =
  | { ok: true }
  | {
      ok: false;
      classification: 'invalid' | 'already_completed';
      message: string;
      packageError: boolean;
    };

/** Mirrors the status/expiry gates used by Laravel's passkey lookup. */
export function validateOfflinePasskeyEligibility(
  registration: OfflinePasskeyEligibilityRegistration,
  now: number = Date.now(),
): OfflinePasskeyEligibility {
  const resultStatus = String(registration.result_status ?? '').trim().toLowerCase();
  if (resultStatus === 'passed' || resultStatus === 'failed') {
    return {
      ok: false,
      classification: 'already_completed',
      message:
        'Examination Already Completed\nYou have already taken this examination. Multiple attempts are not permitted.',
      packageError: false,
    };
  }

  const passkeyStatus = String(registration.passkey_status ?? '').trim().toLowerCase();
  if (!passkeyStatus) {
    return {
      ok: false,
      classification: 'invalid',
      message:
        'Passkey status is missing from the proctor phone examination pack. Ask the proctor to update the pack and reopen this room.',
      packageError: true,
    };
  }
  if (!['not_sent', 'sent'].includes(passkeyStatus)) {
    return {
      ok: false,
      classification: 'invalid',
      message:
        passkeyStatus === 'revoked'
          ? 'This examination key has been revoked. Ask the proctor for assistance.'
          : 'This examination key has already been used or reserved on another device.',
      packageError: false,
    };
  }

  const expiresAt = Date.parse(String(registration.passkey_expires_at ?? ''));
  if (!Number.isFinite(expiresAt)) {
    return {
      ok: false,
      classification: 'invalid',
      message:
        'Passkey expiry is missing from the proctor phone examination pack. Ask the proctor to update the pack and reopen this room.',
      packageError: true,
    };
  }
  if (expiresAt < now) {
    return {
      ok: false,
      classification: 'invalid',
      message: 'This examination key has expired.',
      packageError: false,
    };
  }

  return { ok: true };
}
