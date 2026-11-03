import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchOfflinePasskeyRegistrations,
  selectOfflinePasskeyRegistration,
  validateOfflinePasskeyEligibility,
} from './offlinePasskeyEligibility';

const NOW = Date.parse('2026-11-03T09:00:00+08:00');

test('offline passkey eligibility accepts an active downloaded passkey', () => {
  assert.deepEqual(
    validateOfflinePasskeyEligibility(
      {
        passkey_status: 'sent',
        passkey_expires_at: '2026-11-03T17:00:00+08:00',
        result_status: 'pending',
      },
      NOW,
    ),
    { ok: true },
  );
});

test('offline passkey eligibility distinguishes revoked, expired, and completed keys', () => {
  const revoked = validateOfflinePasskeyEligibility(
    { passkey_status: 'revoked', passkey_expires_at: '2026-11-03T17:00:00+08:00' },
    NOW,
  );
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.match(revoked.message, /revoked/i);

  const expired = validateOfflinePasskeyEligibility(
    { passkey_status: 'sent', passkey_expires_at: '2026-11-03T08:59:59+08:00' },
    NOW,
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.match(expired.message, /expired/i);

  const completed = validateOfflinePasskeyEligibility(
    {
      passkey_status: 'used',
      passkey_expires_at: '2026-11-03T17:00:00+08:00',
      result_status: 'passed',
    },
    NOW,
  );
  assert.equal(completed.ok, false);
  if (!completed.ok) assert.equal(completed.classification, 'already_completed');
});

test('offline passkey eligibility identifies incomplete package metadata', () => {
  const missingStatus = validateOfflinePasskeyEligibility(
    { passkey_expires_at: '2026-11-03T17:00:00+08:00' },
    NOW,
  );
  assert.equal(missingStatus.ok, false);
  if (!missingStatus.ok) assert.equal(missingStatus.packageError, true);

  const missingExpiry = validateOfflinePasskeyEligibility({ passkey_status: 'sent' }, NOW);
  assert.equal(missingExpiry.ok, false);
  if (!missingExpiry.ok) assert.equal(missingExpiry.packageError, true);
});

test('offline passkey matching keeps the exact hash bound to the active schedule registration', () => {
  const registrations = [
    {
      id: 301,
      examination_schedule_id: 101,
      exam_passkey_hash: 'a'.repeat(64),
    },
    {
      id: 999,
      examination_schedule_id: 202,
      exam_passkey_hash: 'b'.repeat(64),
    },
  ];
  const matches = matchOfflinePasskeyRegistrations(
    registrations,
    'ABCD2345',
    'a'.repeat(64),
  );

  assert.equal(selectOfflinePasskeyRegistration(matches, 101)?.id, 301);
  assert.equal(selectOfflinePasskeyRegistration(matches, 202), undefined);
});
