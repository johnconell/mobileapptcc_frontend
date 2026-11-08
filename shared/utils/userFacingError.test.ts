import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userFacingError } from './userFacingError';

test('maps known mobile failures to their user-facing recovery message', () => {
  assert.equal(
    userFacingError(new Error('Invalid passkey for this examination')),
    'Invalid passkey. Please check and try again.',
  );
  assert.equal(
    userFacingError(new Error('The student is assigned to a different room')),
    'You are assigned to a different examination room.',
  );
  assert.equal(
    userFacingError(new Error('Examination not scheduled for this session')),
    'Your examination is not scheduled for this session.',
  );
  assert.equal(
    userFacingError(new Error('This QR code has expired')),
    'This QR code is no longer valid. Request a new code from your proctor.',
  );
  assert.equal(
    userFacingError(new Error('This room is assigned to another proctor')),
    'This room is assigned to another proctor.',
  );
  assert.equal(
    userFacingError(new Error('Cannot reach proctor on Wi-Fi')),
    "Cannot connect to the proctor's device. Check your local network connection.",
  );
  assert.equal(
    userFacingError(new Error('Sync request failed')),
    'Results are saved locally but could not be synchronized. Retry when internet is available.',
  );
});

test('maps technical failures to a contextual fallback without exposing internals', () => {
  const fallback = 'Unable to save your answers on this device. Keep the exam open and retry.';
  assert.equal(
    userFacingError(new Error('Request failed for https://private.example/api/v1 with token abc'), fallback),
    fallback,
  );
  assert.equal(
    userFacingError({ status: 401, message: 'Unauthenticated' }),
    'Your session has expired. Please log in again.',
  );
});

test('does not log raw failure messages that may contain sensitive data', () => {
  const originalWarn = console.warn;
  const calls: unknown[][] = [];
  console.warn = (...args: unknown[]) => calls.push(args);
  try {
    userFacingError(new Error('failed request with passkey K7M2P9QX'));
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls).includes('K7M2P9QX'), false);
});
