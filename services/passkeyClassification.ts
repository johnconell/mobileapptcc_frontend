export type PasskeyMatchClassification = 'valid' | 'wrong_schedule' | 'invalid';

export function classifyPasskeyMatch(input: {
  currentScheduleId: number | null | undefined;
  matchingScheduleIds: Array<number | string | null | undefined>;
}): PasskeyMatchClassification {
  const current = Number(input.currentScheduleId);
  if (!Number.isFinite(current)) return 'invalid';

  const hasMatching = input.matchingScheduleIds.some((id) => {
    const value = Number(id);
    return Number.isFinite(value) && value === current;
  });

  if (hasMatching) return 'valid';

  const hasAny = input.matchingScheduleIds.some((id) => {
    const value = Number(id);
    return Number.isFinite(value);
  });

  return hasAny ? 'wrong_schedule' : 'invalid';
}
