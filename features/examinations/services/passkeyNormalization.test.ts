import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { maskedExamPasskey, normalizeExamPasskey } from './passkeyNormalization';

test('normalizes the supplied primary and backup test keys before SHA-256', () => {
  const cases = [
    { input: ' 8YWFCP77 ', expected: '8YWFCP77' },
    { input: 'qcmjssad', expected: 'QCMJSSAD' },
    { input: '\u200B8YWFCP77\uFEFF', expected: '8YWFCP77' },
  ];

  for (const { input, expected } of cases) {
    const normalized = normalizeExamPasskey(input);
    const mobileHash = createHash('sha256').update(normalized, 'utf8').digest('hex');
    const backendEquivalentHash = createHash('sha256')
      .update(expected.trim().toUpperCase(), 'utf8')
      .digest('hex');

    assert.equal(normalized, expected);
    assert.equal(mobileHash, backendEquivalentHash);
  }
});

test('developer log masking never includes the passkey', () => {
  assert.equal(maskedExamPasskey('8YWFCP77'), '[REDACTED 8 chars]');
  assert.equal(maskedExamPasskey(''), '[EMPTY]');
});
