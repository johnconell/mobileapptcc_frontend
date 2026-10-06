import { classifyPasskeyMatch } from '@/features/examinations/services/passkeyClassification';
import { normalizeExamPasskey } from '@/features/examinations/services/passkeyNormalization';
import type { OfflinePack } from './offlineStore';

type PackRegistration = OfflinePack['registrations'][number];
type PackApplicant = OfflinePack['applicants'][number];
type PackSchedule = OfflinePack['schedules'][number];

export type OfflinePasskeyLookupResult =
  | {
      kind: 'valid';
      registration: PackRegistration;
      applicant: PackApplicant;
      schedule: PackSchedule;
    }
  | { kind: 'wrong_schedule'; message: string; schedule?: PackSchedule }
  | { kind: 'wrong_applicant'; message: string }
  | {
      kind: 'invalid';
      reason:
        | 'pack_missing'
        | 'schedule_id_missing'
        | 'key_not_in_pack'
        | 'applicant_missing'
        | 'schedule_missing'
        | 'key_expired'
        | 'key_revoked'
        | 'key_unavailable';
      message: string;
    }
  | { kind: 'already_used'; message: string };

const invalid = (
  reason: Extract<OfflinePasskeyLookupResult, { kind: 'invalid' }>['reason'],
  message: string,
): OfflinePasskeyLookupResult => ({ kind: 'invalid', reason, message });

export function lookupOfflinePasskey(input: {
  pack: OfflinePack | null;
  scheduleId: number | null;
  normalizedPasskey: string;
  normalizedHash: string;
  applicantCode?: string | null;
  allowExpiredForTest?: boolean;
  now?: number;
}): OfflinePasskeyLookupResult {
  const { pack, scheduleId, normalizedPasskey } = input;
  if (!pack) {
    return invalid('pack_missing', 'The proctor has no downloaded examination roster. Update the exam pack and reopen the room.');
  }
  if (scheduleId == null || !Number.isFinite(Number(scheduleId))) {
    return invalid('schedule_id_missing', 'The proctor lobby is missing its schedule ID. Reopen the correct examination room.');
  }

  const expectedHash = input.normalizedHash.toLowerCase();
  const matches = pack.registrations.filter((registration) => {
    const storedHash = String(registration.exam_passkey_hash || '').toLowerCase();
    if (storedHash) return storedHash === expectedHash;
    return normalizeExamPasskey(registration.exam_passkey) === normalizedPasskey;
  });

  if (!matches.length) {
    return invalid(
      'key_not_in_pack',
      'This key is not in the proctor’s downloaded roster. Update the examination pack and reopen the room.',
    );
  }

  const matchingScheduleIds = matches.map((registration) => registration.examination_schedule_id);
  const classification = classifyPasskeyMatch({
    currentScheduleId: scheduleId,
    matchingScheduleIds,
  });
  if (classification === 'wrong_schedule') {
    const otherScheduleId = matchingScheduleIds.find((value) => Number(value) !== Number(scheduleId));
    const otherSchedule = pack.schedules.find((schedule) => Number(schedule.id) === Number(otherScheduleId));
    return {
      kind: 'wrong_schedule',
      message: `This examination key belongs to ${otherSchedule?.title || 'a different examination schedule'}. Use the correct key for this room.`,
      schedule: otherSchedule,
    };
  }

  const registration = matches.find(
    (candidate) => Number(candidate.examination_schedule_id) === Number(scheduleId),
  );
  if (!registration) {
    return invalid('key_not_in_pack', 'This key is not assigned to the active examination schedule.');
  }

  if (registration.passkey_status === 'used') {
    return { kind: 'already_used', message: 'This examination key has already been used.' };
  }
  if (registration.passkey_status === 'revoked') {
    return invalid('key_revoked', 'This examination key has been revoked.');
  }
  if (
    registration.passkey_status &&
    !['not_sent', 'sent'].includes(registration.passkey_status)
  ) {
    return invalid('key_unavailable', 'This examination key is not available for this examination.');
  }

  const expiry = registration.passkey_expires_at
    ? Date.parse(registration.passkey_expires_at)
    : Number.NaN;
  if (
    Number.isFinite(expiry) &&
    expiry <= (input.now ?? Date.now()) &&
    !input.allowExpiredForTest
  ) {
    return invalid('key_expired', 'This examination key has expired. Ask the proctor to verify the schedule and issue a current key.');
  }

  const applicant = pack.applicants.find(
    (candidate) => Number(candidate.id) === Number(registration.applicant_id),
  );
  if (!applicant) {
    return invalid('applicant_missing', 'The proctor’s roster has no applicant linked to this key. Update the examination pack.');
  }

  const expectedApplicantCode = normalizeExamPasskey(input.applicantCode);
  if (
    expectedApplicantCode &&
    normalizeExamPasskey(applicant.applicant_code) !== expectedApplicantCode
  ) {
    return {
      kind: 'wrong_applicant',
      message: 'This examination key belongs to a different applicant.',
    };
  }

  const schedule = pack.schedules.find((candidate) => Number(candidate.id) === Number(scheduleId));
  if (!schedule) {
    return invalid('schedule_missing', 'The proctor’s downloaded roster is missing the active schedule. Update the exam pack and reopen the room.');
  }

  return { kind: 'valid', registration, applicant, schedule };
}
