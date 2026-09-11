import { classifyPasskeyMatch } from './passkeyClassification';

const cases = [
  {
    name: 'accepts a passkey for the current schedule',
    currentScheduleId: 12,
    matchingScheduleIds: [12],
    expected: 'valid' as const,
  },
  {
    name: 'rejects a passkey for a different schedule',
    currentScheduleId: 12,
    matchingScheduleIds: [13],
    expected: 'wrong_schedule' as const,
  },
  {
    name: 'rejects a passkey with no matching schedule',
    currentScheduleId: 12,
    matchingScheduleIds: [],
    expected: 'invalid' as const,
  },
];

for (const testCase of cases) {
  const actual = classifyPasskeyMatch({
    currentScheduleId: testCase.currentScheduleId,
    matchingScheduleIds: testCase.matchingScheduleIds,
  });
  if (actual !== testCase.expected) {
    throw new Error(`${testCase.name}: expected ${testCase.expected}, got ${actual}`);
  }
}
