import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  isPracticeTutorialTargetAllowed,
  nextPracticeTutorialIndex,
  PRACTICE_TUTORIAL_STEPS,
} from './tutorialEngine';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('practice tutorial engine keeps all eleven targets in the required order', () => {
  assert.deepEqual(PRACTICE_TUTORIAL_STEPS.map((step) => step.target), [
    'tutorial-skip-scan',
    'tutorial-key-chip',
    'tutorial-agree',
    'tutorial-lobby-card',
    'tutorial-timer',
    'tutorial-view-toggle',
    'tutorial-first-choice',
    'tutorial-mark-not-sure',
    'tutorial-questions-button',
    'tutorial-question-5',
    'tutorial-submit',
  ]);
  assert.equal(PRACTICE_TUTORIAL_STEPS.length, 11);
  for (let index = 0; index < 10; index += 1) {
    assert.equal(nextPracticeTutorialIndex(index), index + 1);
  }
  assert.equal(nextPracticeTutorialIndex(10), 10);
});

test('action steps allow only their highlighted target and info steps allow no target press', () => {
  PRACTICE_TUTORIAL_STEPS.forEach((step, index) => {
    assert.equal(isPracticeTutorialTargetAllowed(index, step.target), step.action);
    assert.equal(isPracticeTutorialTargetAllowed(index, 'not-the-current-target'), false);
  });
});

test('real student routes do not mount the practice tutorial provider', () => {
  const realLayout = read('app/(student)/_layout.tsx');
  const realExam = read('app/(student)/exam.tsx');
  assert.equal(realLayout.includes('PracticeTutorialProvider'), false);
  assert.equal(realExam.includes('PracticeTutorialProvider'), false);
});

test('practice Join, Key, Confirm and Lobby routes render the real student-flow components', () => {
  const routes = [
    ['app/practice/scan.tsx', '@/app/(student)/scan', 'JoinExaminationScreen'],
    ['app/practice/passkey.tsx', '@/app/(student)/passkey', 'StudentPasskeyScreen'],
    ['app/practice/confirmation.tsx', '@/app/(student)/confirmation', 'StudentConfirmationScreen'],
    ['app/practice/lobby.tsx', '@/app/(student)/lobby', 'PracticeWaitingRoom'],
  ] as const;
  for (const [route, source, component] of routes) {
    const contents = read(route);
    assert.ok(contents.includes(source), `${route} imports ${source}`);
    assert.ok(contents.includes(component), `${route} renders ${component}`);
    if (route !== 'app/practice/lobby.tsx') {
      assert.ok(contents.includes('practiceMode'), `${route} sets practiceMode`);
    }
  }
  const lobby = read('app/(student)/lobby.tsx');
  assert.ok(lobby.includes('export function LobbyRedesign'));
  assert.ok(lobby.includes('<LobbyRedesign'));
});
