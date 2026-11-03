import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSecureApiBase } from './apiReachability';

test('release API requests require HTTPS', () => {
  assert.doesNotThrow(() => assertSecureApiBase('https://api.example.test/api/v1', false));
  assert.throws(
    () => assertSecureApiBase('http://192.168.1.10:8000/api/v1', false),
    /Release builds require HTTPS/,
  );
});

test('development builds may use HTTP for local development', () => {
  assert.doesNotThrow(() => assertSecureApiBase('http://127.0.0.1:8000/api/v1', true));
});
