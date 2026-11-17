import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_STEPS } from '../../features/tutorial/tutorialData';

test('Applicant Examination Tutorial: Structure and Content Verification', async (t) => {
  await t.test('verifies all 11 required steps exist in strict sequential order', () => {
    assert.equal(TUTORIAL_STEPS.length, 11);
    TUTORIAL_STEPS.forEach((step, index) => {
      assert.equal(step.id, index + 1);
    });
  });

  await t.test('verifies exact step titles according to examination guidelines', () => {
    const expectedTitles = [
      'Welcome to Your Entrance Examination',
      "Connect to Proctor's Exam Wi-Fi",
      'Join Your Examination',
      'Input Your Examination Passkey',
      'Confirm Your Information',
      'Wait for Your Proctor',
      'Terms & Mandatory Screen Pinning',
      'Answer Questions (Scroll Down)',
      'Track Your Progress',
      'Review and Submit Your Exam',
      'Examination Successfully Submitted',
    ];

    expectedTitles.forEach((expected, index) => {
      assert.equal(
        TUTORIAL_STEPS[index].title,
        expected,
        `Step ${index + 1} title should match exact specification`
      );
    });
  });

  await t.test('verifies all steps have descriptive bullet points, pro-tips, and mascot moods', () => {
    TUTORIAL_STEPS.forEach((step) => {
      assert.ok(step.subtitle.length > 10, `Step ${step.id} has valid subtitle`);
      assert.ok(step.bullets.length >= 3, `Step ${step.id} has at least 3 descriptive bullets`);
      assert.ok(step.proTip.length > 10, `Step ${step.id} has pro-tip`);
      assert.ok(step.mascotMood, `Step ${step.id} has mascot mood`);
      assert.ok(step.image, `Step ${step.id} has authentic screenshot image`);
    });
  });

  await t.test('verifies Step 4 explicitly covers passkey entry from exam permit', () => {
    const passkeyStep = TUTORIAL_STEPS[3];
    assert.equal(passkeyStep.id, 4);
    assert.equal(passkeyStep.mascotMood, 'passkey');
    assert.ok(
      passkeyStep.bullets.some((b) => b.text.toLowerCase().includes('passkey')),
      'Passkey step explicitly explains entering passkey'
    );
  });

  await t.test('verifies Step 7 explicitly covers Mandatory Screen Pinning / App Pinning', () => {
    const pinningStep = TUTORIAL_STEPS[6];
    assert.equal(pinningStep.id, 7);
    assert.ok(
      pinningStep.bullets.some((b) => b.text.includes('Screen Pinning')),
      'Step 7 explicitly highlights Mandatory Screen Pinning'
    );
  });

  await t.test('verifies Step 8 specifies continuous Scroll Down examination mode', () => {
    const scrollStep = TUTORIAL_STEPS[7];
    assert.equal(scrollStep.id, 8);
    assert.ok(
      scrollStep.bullets.some((b) => b.text.toLowerCase().includes('scroll')),
      'Step 8 explicitly highlights Scroll Down navigation mode'
    );
  });

  await t.test('verifies offline LAN instructions emphasize no internet required', () => {
    const wifiStep = TUTORIAL_STEPS[1];
    assert.ok(
      wifiStep.bullets.some((b) => b.text.toLowerCase().includes('no external internet')),
      'Wi-Fi step explicitly highlights that network does not have internet access'
    );
  });

  await t.test('verifies Step 3 details both QR Code and Manual Room Code joining methods', () => {
    const joinStep = TUTORIAL_STEPS[2];
    assert.ok(
      joinStep.bullets.some((b) => b.text.includes('Scan QR')),
      'Join step mentions QR scanning method'
    );
    assert.ok(
      joinStep.bullets.some((b) => b.text.includes('Enter code')),
      'Join step mentions manual code method'
    );
  });
});
