export type AttendanceStatus = 'not_arrived' | 'present' | 'absent';

/** Admission is the sole event that records Present. Existing marks are immutable. */
export function recordAdmissionAttendance(current?: string | null): AttendanceStatus {
  if (current === 'present') return 'present';
  if (current === 'absent') return 'absent';
  return 'present';
}

/** Session start closes the roll: only unresolved students become Absent. */
export function closeAttendanceAtStart(current?: string | null): AttendanceStatus {
  if (current === 'present') return 'present';
  if (current === 'absent') return 'absent';
  return 'absent';
}

export function attendanceAtSnapshot(
  recorded: string | null | undefined,
  sessionStarted: boolean,
): AttendanceStatus {
  if (recorded === 'present' || recorded === 'absent') return recorded;
  return sessionStarted ? 'absent' : 'not_arrived';
}
