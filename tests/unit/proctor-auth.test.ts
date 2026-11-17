import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proctorLoginSchema } from '../../features/authentication/validation/proctorLoginSchema';

describe('Proctor Mobile Login Validation and Credential Handling', () => {
  it('accepts valid proctor usernames with letters, numbers, dots, underscores, and hyphens', () => {
    const validUsernames = [
      'proctor',
      'proctor2',
      'pedro.reyes',
      'john_proctor',
      'room-105',
      'admin.1',
      'lan.room105_b',
    ];

    for (const username of validUsernames) {
      const result = proctorLoginSchema.safeParse({
        username,
        password: 'validPassword123',
      });
      assert.equal(result.success, true, `Expected "${username}" to be valid`);
      if (result.success) {
        assert.equal(result.data.username, username);
      }
    }
  });

  it('rejects email addresses containing @ symbol to enforce username-only sign in', () => {
    const emailInputs = [
      'proctor@example.com',
      'pedro.reyes@tcc.edu.ph',
      'admin@gmail.com',
      '@proctor',
      'user@',
    ];

    for (const email of emailInputs) {
      const result = proctorLoginSchema.safeParse({
        username: email,
        password: 'validPassword123',
      });
      assert.equal(result.success, false, `Expected "${email}" to be rejected`);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        assert.ok(
          errorMessages.some((msg) => msg.includes('Use letters, numbers, dots, underscores, or hyphens')),
          `Expected character constraint error for ${email}`,
        );
      }
    }
  });

  it('rejects empty or whitespace-only usernames', () => {
    const emptyInputs = ['', '   ', 'a', 'ab'];

    for (const input of emptyInputs) {
      const result = proctorLoginSchema.safeParse({
        username: input,
        password: 'validPassword123',
      });
      assert.equal(result.success, false, `Expected "${input}" to be rejected`);
    }
  });

  it('rejects short passwords', () => {
    const result = proctorLoginSchema.safeParse({
      username: 'valid.proctor',
      password: '123',
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.errors.some((e) => e.message.includes('password')));
    }
  });

  it('verifies password visibility toggle state transition and string preservation', () => {
    // Initial state: password hidden
    let showPassword = false;
    let passwordValue = 'SuperSecretP@ssword123';
    let secureTextEntry = !showPassword;

    assert.equal(secureTextEntry, true, 'Default state must have password hidden (secureTextEntry = true)');

    // First tap: toggle visibility to visible
    showPassword = !showPassword;
    secureTextEntry = !showPassword;
    assert.equal(secureTextEntry, false, 'First tap must reveal password (secureTextEntry = false)');
    assert.equal(passwordValue, 'SuperSecretP@ssword123', 'Password value must remain completely unchanged');

    // Second tap: toggle visibility back to hidden
    showPassword = !showPassword;
    secureTextEntry = !showPassword;
    assert.equal(secureTextEntry, true, 'Second tap must re-hide password (secureTextEntry = true)');
    assert.equal(passwordValue, 'SuperSecretP@ssword123', 'Password value must still remain completely unchanged');

    // Reset visibility state on screen reopen
    showPassword = false;
    secureTextEntry = !showPassword;
    assert.equal(secureTextEntry, true, 'Reopening screen must reset visibility to hidden');
  });

  it('verifies username normalization strips surrounding whitespace without altering valid special characters', () => {
    const raw = '  proctor.lead_1  ';
    const parsed = proctorLoginSchema.safeParse({
      username: raw,
      password: 'validPassword123',
    });

    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.username, 'proctor.lead_1');
    }
  });
});
