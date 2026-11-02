/**
 * ExamTimerCoordinator
 *
 * Authoritative examination timer restoration, monotonic tracking,
 * and time inconsistency detection for offline and peer-proctored exams.
 *
 * Security & Integrity Principles:
 * 1. Schedule availability window (e.g. 8:00 AM - 12:00 PM) is strictly separated
 *    from individual attempt duration/deadline (e.g. 60 minutes from start).
 * 2. Never restores countdown seconds unchanged across app restart or backgrounding;
 *    recalculates remaining time against the authoritative deadline.
 * 3. Uses monotonic elapsed time (performance.now) during an active process to prevent
 *    in-session device clock tampering.
 * 4. Detects device clock rollbacks (current time < last known time).
 * 5. Fails closed on clock tampering: preserves all saved answers, halts answering,
 *    and requires trusted proctor/backend time reconciliation to resume.
 * 6. Never grants extra time because the student closed or backgrounded the app.
 */

export const CLOCK_ROLLBACK_TOLERANCE_MS = 3_000; // 3 seconds grace for minor NTP sync jitter
export const MONOTONIC_DRIFT_TOLERANCE_MS = 6_000; // 6 seconds tolerance between monotonic and wall clock

export type TimerStateStatus =
  | 'not_started'
  | 'running'
  | 'paused'
  | 'expired'
  | 'reconciliation_required';

export type TimeSyncAuthority = 'proctor_peer' | 'cloud' | 'local_offline';

const CURRENT_PROCESS_SESSION_ID = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function getCurrentProcessSessionId(): string {
  return CURRENT_PROCESS_SESSION_ID;
}

export type TimeSyncMetadata = {
  processSessionId?: string;       // Process token to identify active in-process lifetime
  serverTimeAtSync?: string;       // Authoritative ISO string from proctor or cloud
  deviceTimeAtSyncMs: number;      // Date.now() when synchronization occurred
  monotonicAtSyncMs?: number;      // performance.now() when synchronization occurred
  trustedOffsetMs: number;         // (serverTimeMs - deviceTimeMs) offset
  lastKnownDeviceTimeMs: number;   // Date.now() at last checkpoint or state save
  lastKnownMonotonicMs?: number;   // performance.now() at last checkpoint or tick
  syncAuthority: TimeSyncAuthority;
};

export type TimerCalculationInput = {
  startedAt: string;
  deadline: string;
  scheduleClosingTime?: string | null;
  timeSync: TimeSyncMetadata;
  nowDeviceMs?: number;
  nowMonotonicMs?: number;
};

export type TimerRecalculateResult = {
  remainingSeconds: number;
  status: TimerStateStatus;
  statusReason?: string;
  isExpired: boolean;
  isAnsweringAllowed: boolean;
  clockRollbackDetected: boolean;
  monotonicDriftDetected: boolean;
  trustedNowMs: number;
  updatedTimeSync: TimeSyncMetadata;
};

export function getMonotonicTimeMs(): number | null {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return null;
}

export function computeEffectiveDeadline(
  startedAtIso: string,
  durationMinutes: number,
  scheduleClosingIso?: string | null,
): { deadlineIso: string; boundedBySchedule: boolean } {
  const startedMs = new Date(startedAtIso).getTime();
  const nominalDeadlineMs = startedMs + durationMinutes * 60_000;

  if (scheduleClosingIso) {
    const scheduleClosingMs = new Date(scheduleClosingIso).getTime();
    if (!Number.isNaN(scheduleClosingMs) && scheduleClosingMs < nominalDeadlineMs) {
      return {
        deadlineIso: new Date(scheduleClosingMs).toISOString(),
        boundedBySchedule: true,
      };
    }
  }

  return {
    deadlineIso: new Date(nominalDeadlineMs).toISOString(),
    boundedBySchedule: false,
  };
}

export function createInitialTimeSync(params?: {
  serverTimeIso?: string;
  authority?: TimeSyncAuthority;
  customOffsetMs?: number;
  deviceNowMs?: number;
  monotonicNowMs?: number;
}): TimeSyncMetadata {
  const deviceNowMs = params?.deviceNowMs ?? Date.now();
  const monotonicNow = params?.monotonicNowMs !== undefined ? params.monotonicNowMs : getMonotonicTimeMs();

  let trustedOffsetMs = params?.customOffsetMs ?? 0;
  if (params?.serverTimeIso) {
    const serverMs = new Date(params.serverTimeIso).getTime();
    if (!Number.isNaN(serverMs)) {
      trustedOffsetMs = serverMs - deviceNowMs;
    }
  }

  return {
    processSessionId: CURRENT_PROCESS_SESSION_ID,
    serverTimeAtSync: params?.serverTimeIso,
    deviceTimeAtSyncMs: deviceNowMs,
    monotonicAtSyncMs: monotonicNow ?? undefined,
    trustedOffsetMs,
    lastKnownDeviceTimeMs: deviceNowMs,
    lastKnownMonotonicMs: monotonicNow ?? undefined,
    syncAuthority: params?.authority ?? (params?.serverTimeIso ? 'proctor_peer' : 'local_offline'),
  };
}

/**
 * Detects device clock rollbacks where current device time is earlier than the
 * last recorded device time beyond the permissible jitter tolerance.
 */
export function detectClockRollback(
  currentDeviceTimeMs: number,
  lastKnownDeviceTimeMs: number,
  toleranceMs: number = CLOCK_ROLLBACK_TOLERANCE_MS,
): boolean {
  return currentDeviceTimeMs < lastKnownDeviceTimeMs - toleranceMs;
}

/**
 * During an active process, verifies that wall-clock time and monotonic elapsed time
 * have advanced consistently. If the wall-clock jumped while monotonic did not,
 * clock manipulation or time shift has occurred.
 */
export function detectMonotonicDrift(params: {
  currentDeviceMs: number;
  lastKnownDeviceMs: number;
  currentMonotonicMs?: number | null;
  lastKnownMonotonicMs?: number | null;
  toleranceMs?: number;
}): boolean {
  const { currentDeviceMs, lastKnownDeviceMs, currentMonotonicMs, lastKnownMonotonicMs } = params;
  if (currentMonotonicMs == null || lastKnownMonotonicMs == null) {
    return false;
  }
  const tolerance = params.toleranceMs ?? MONOTONIC_DRIFT_TOLERANCE_MS;
  const deltaDevice = currentDeviceMs - lastKnownDeviceMs;
  const deltaMono = currentMonotonicMs - lastKnownMonotonicMs;

  return Math.abs(deltaDevice - deltaMono) > tolerance;
}

/**
 * Re-evaluates remaining examination time against the authoritative deadline.
 * Handles resume, app foregrounding, and regular watchdog ticks.
 */
export function recalculateTimer(input: TimerCalculationInput): TimerRecalculateResult {
  const currentDeviceMs = input.nowDeviceMs ?? Date.now();
  // If caller explicitly provided nowDeviceMs without nowMonotonicMs (simulation/test),
  // do not synthesize a mismatched real monotonic timestamp from Node/device.
  const currentMonotonicMs =
    input.nowMonotonicMs !== undefined
      ? input.nowMonotonicMs
      : input.nowDeviceMs !== undefined
        ? null
        : getMonotonicTimeMs();

  const isRollback = detectClockRollback(
    currentDeviceMs,
    input.timeSync.lastKnownDeviceTimeMs,
    CLOCK_ROLLBACK_TOLERANCE_MS,
  );

  const isDrift = detectMonotonicDrift({
    currentDeviceMs,
    lastKnownDeviceMs: input.timeSync.lastKnownDeviceTimeMs,
    currentMonotonicMs,
    lastKnownMonotonicMs: input.timeSync.lastKnownMonotonicMs,
    toleranceMs: MONOTONIC_DRIFT_TOLERANCE_MS,
  });

  // Calculate trusted current time:
  // Monotonic tracking is only valid within the active running process session.
  // Across process boundaries (restarts/restores), monotonic values reset to zero,
  // so wall-clock plus trusted offset is used while rollback checks enforce monotonicity.
  const isWithinActiveProcess =
    input.timeSync.processSessionId != null &&
    input.timeSync.processSessionId === CURRENT_PROCESS_SESSION_ID;

  let trustedNowMs: number;
  if (
    isWithinActiveProcess &&
    currentMonotonicMs != null &&
    input.timeSync.monotonicAtSyncMs != null &&
    !isRollback
  ) {
    const monoElapsed = currentMonotonicMs - input.timeSync.monotonicAtSyncMs;
    trustedNowMs = input.timeSync.deviceTimeAtSyncMs + input.timeSync.trustedOffsetMs + monoElapsed;
  } else {
    trustedNowMs = currentDeviceMs + input.timeSync.trustedOffsetMs;
  }

  const deadlineMs = new Date(input.deadline).getTime();
  let remainingMs = deadlineMs - trustedNowMs;

  // Enforce schedule window cap if applicable
  if (input.scheduleClosingTime) {
    const scheduleClosingMs = new Date(input.scheduleClosingTime).getTime();
    if (!Number.isNaN(scheduleClosingMs)) {
      const scheduleRemainingMs = scheduleClosingMs - trustedNowMs;
      if (scheduleRemainingMs < remainingMs) {
        remainingMs = scheduleRemainingMs;
      }
    }
  }

  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const isExpired = remainingSeconds <= 0;

  let status: TimerStateStatus = 'running';
  let statusReason: string | undefined;

  if (isRollback) {
    status = 'reconciliation_required';
    statusReason = 'Device clock rollback detected. Answers preserved; trusted time reconciliation required.';
  } else if (isDrift && input.timeSync.syncAuthority === 'local_offline') {
    status = 'reconciliation_required';
    statusReason = 'System clock jumped during active examination. Trusted time reconciliation required.';
  } else if (isExpired) {
    status = 'expired';
    statusReason = 'Examination deadline elapsed.';
  }

  const updatedTimeSync: TimeSyncMetadata = {
    ...input.timeSync,
    processSessionId: CURRENT_PROCESS_SESSION_ID,
    deviceTimeAtSyncMs: !isWithinActiveProcess ? currentDeviceMs : input.timeSync.deviceTimeAtSyncMs,
    monotonicAtSyncMs: !isWithinActiveProcess ? (currentMonotonicMs ?? undefined) : input.timeSync.monotonicAtSyncMs,
    lastKnownDeviceTimeMs: currentDeviceMs,
    lastKnownMonotonicMs: currentMonotonicMs ?? undefined,
  };

  return {
    remainingSeconds,
    status,
    statusReason,
    isExpired,
    isAnsweringAllowed: status === 'running',
    clockRollbackDetected: isRollback,
    monotonicDriftDetected: isDrift,
    trustedNowMs,
    updatedTimeSync,
  };
}

/**
 * Reconciles the client timer with an authoritative pulse from the proctor peer server or cloud.
 */
export function reconcileWithAuthorityPulse(params: {
  serverTimeIso?: string;
  startedAtIso?: string;
  endsAtIso?: string;
  durationMinutes?: number;
  serverRemainingSeconds?: number;
  currentSync: TimeSyncMetadata;
  deadlineIso: string;
  scheduleClosingIso?: string | null;
  authority: 'proctor_peer' | 'cloud';
}): {
  remainingSeconds: number;
  deadlineIso: string;
  timeSync: TimeSyncMetadata;
  status: TimerStateStatus;
} {
  const deviceNowMs = Date.now();
  const monotonicNow = getMonotonicTimeMs();

  let trustedOffsetMs = params.currentSync.trustedOffsetMs;
  let serverNowMs: number | null = null;

  if (params.serverTimeIso) {
    const parsed = new Date(params.serverTimeIso).getTime();
    if (!Number.isNaN(parsed)) {
      serverNowMs = parsed;
      trustedOffsetMs = serverNowMs - deviceNowMs;
    }
  }

  // Update deadline if server provided endsAt
  let effectiveDeadline = params.deadlineIso;
  if (params.endsAtIso) {
    effectiveDeadline = params.endsAtIso;
  } else if (params.startedAtIso && params.durationMinutes) {
    effectiveDeadline = computeEffectiveDeadline(
      params.startedAtIso,
      params.durationMinutes,
      params.scheduleClosingIso,
    ).deadlineIso;
  }

  const updatedSync: TimeSyncMetadata = {
    processSessionId: CURRENT_PROCESS_SESSION_ID,
    serverTimeAtSync: params.serverTimeIso ?? params.currentSync.serverTimeAtSync,
    deviceTimeAtSyncMs: deviceNowMs,
    monotonicAtSyncMs: monotonicNow ?? undefined,
    trustedOffsetMs,
    lastKnownDeviceTimeMs: deviceNowMs,
    lastKnownMonotonicMs: monotonicNow ?? undefined,
    syncAuthority: params.authority,
  };

  // If server directly told us remainingSeconds, respect it as upper bound
  let remainingSeconds: number;
  if (typeof params.serverRemainingSeconds === 'number' && params.serverRemainingSeconds >= 0) {
    remainingSeconds = params.serverRemainingSeconds;
  } else {
    const trustedNowMs = deviceNowMs + trustedOffsetMs;
    const deadlineMs = new Date(effectiveDeadline).getTime();
    remainingSeconds = Math.max(0, Math.floor((deadlineMs - trustedNowMs) / 1000));
  }

  const status: TimerStateStatus = remainingSeconds <= 0 ? 'expired' : 'running';

  return {
    remainingSeconds,
    deadlineIso: effectiveDeadline,
    timeSync: updatedSync,
    status,
  };
}
