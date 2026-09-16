import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPasskeyMatch } from '@/features/examinations/services/passkeyClassification';
import { mapServerToAuthority } from '@/features/examinations/services/examAuthority';

/**
 * Integration-style checks for the examinee join → lobby → exam state machine.
 * Expand with mocked LobbyRepository / peer client in future milestones.
 */
describe('exam flow (integration placeholders)', () => {
  it('rejects passkey when schedule does not match scanned session', () => {
    assert.equal(
      classifyPasskeyMatch({ currentScheduleId: 5, matchingScheduleIds: [9] }),
      'wrong_schedule',
    );
  });

  it('does not treat ended room as active for auto-start', () => {
    assert.equal(mapServerToAuthority('ended'), 'ENDED');
    assert.equal(mapServerToAuthority('in_progress'), 'ACTIVE');
  });

  it.todo('QR resolve → passkey → lobby download reaches examReady');
  it.todo('resume exam only when session still in_progress on LAN');
});
