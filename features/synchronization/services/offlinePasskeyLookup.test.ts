import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { OfflinePack } from './offlineStore';
import { lookupOfflinePasskey } from './offlinePasskeyLookup';
import { normalizeExamPasskey } from '../../examinations/services/passkeyNormalization';

const scheduleId = 410;
const pack: OfflinePack = {
  pack_version: 1,
  schedules: [
    {
      id: scheduleId,
      title: 'Entrance Examination',
      exam_date: '2026-10-04',
      start_time: '09:00:00',
      end_time: '10:00:00',
      time_slot: '09:00 AM - 10:00 AM',
    },
  ],
  applicants: [
    { id: 2107, applicant_code: 'APP-2026-2107', name: 'Andrea Garcia' },
    { id: 2189, applicant_code: 'APP-2026-2189', name: 'Jeric Gonzales' },
  ],
  registrations: [
    {
      id: 1,
      examination_schedule_id: scheduleId,
      applicant_id: 2107,
      exam_passkey_hash: createHash('sha256').update('8YWFCP77').digest('hex'),
      passkey_status: 'sent',
      passkey_expires_at: '2026-10-04T10:00:00+08:00',
    },
    {
      id: 2,
      examination_schedule_id: scheduleId,
      applicant_id: 2189,
      exam_passkey_hash: createHash('sha256').update('QCMJSSAD').digest('hex'),
      passkey_status: 'sent',
      passkey_expires_at: '2026-10-04T10:00:00+08:00',
    },
  ],
  question_banks: [],
};

function validate(passkey: string, applicantCode?: string, allowExpiredForTest = false) {
  const normalizedPasskey = normalizeExamPasskey(passkey);
  return lookupOfflinePasskey({
    pack,
    scheduleId,
    normalizedPasskey,
    normalizedHash: createHash('sha256').update(normalizedPasskey).digest('hex'),
    applicantCode,
    allowExpiredForTest,
    now: Date.parse('2026-10-06T12:00:00+08:00'),
  });
}

test('both requested sample keys resolve to their assigned applicants in the scoped schedule', () => {
  const andrea = validate(' 8YWFCP77 ', 'APP-2026-2107', true);
  const jeric = validate('qcmjssad', 'APP-2026-2189', true);

  assert.equal(andrea.kind, 'valid');
  if (andrea.kind === 'valid') assert.equal(andrea.applicant.applicant_code, 'APP-2026-2107');
  assert.equal(jeric.kind, 'valid');
  if (jeric.kind === 'valid') assert.equal(jeric.applicant.applicant_code, 'APP-2026-2189');
});

test('wrong key and mismatched applicant return distinct errors', () => {
  const wrongKey = validate('XXXXXXXX', 'APP-2026-2107', true);
  assert.equal(wrongKey.kind, 'invalid');
  if (wrongKey.kind === 'invalid') assert.equal(wrongKey.reason, 'key_not_in_pack');
  const mismatch = validate('8YWFCP77', 'APP-2026-2189', true);
  assert.equal(mismatch.kind, 'wrong_applicant');
  if (mismatch.kind === 'wrong_applicant') {
    assert.match(mismatch.message, /different applicant/i);
  }
});

test('an expired key is rejected outside test mode and accepted only when the test bypass is enabled', () => {
  assert.equal(validate('8YWFCP77', undefined, false).kind, 'invalid');
  const testMode = validate('8YWFCP77', undefined, true);
  assert.equal(testMode.kind, 'valid');
});
