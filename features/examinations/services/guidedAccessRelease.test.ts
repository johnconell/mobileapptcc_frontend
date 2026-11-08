import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseGuidedAccessForExam } from './examSessionRestrictions';

test('guided access release confirms iOS restrictions are disabled', async () => {
  let status: 'enabled' | 'disabled' | 'unavailable' = 'enabled';
  let requested: boolean | undefined;

  await releaseGuidedAccessForExam(
    async (enabled) => {
      requested = enabled;
      status = 'disabled';
      return true;
    },
    () => status,
  );

  assert.equal(requested, false);
  assert.equal(status, 'disabled');
});

test('unsupported guided access release reports required manual recovery', async () => {
  await assert.rejects(
    releaseGuidedAccessForExam(async () => false, () => 'enabled'),
    /accessibility shortcut/,
  );
});
