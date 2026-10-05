export const RECONNECT_EXIT_AFTER_MS = 60_000;

export function shouldOfferReconnectExit(elapsedMs: number, retryFailed = false): boolean {
  return retryFailed || elapsedMs >= RECONNECT_EXIT_AFTER_MS;
}

export function hasValidLocalStudentParticipation(
  token: string | null,
  progress: {
    sessionId?: string | number | null;
    participationToken?: string | null;
    applicantId?: string | number | null;
    applicantCode?: string | null;
    student?: unknown;
  } | null,
): boolean {
  if (!token || !progress?.sessionId || progress.participationToken !== token) return false;
  return Boolean(progress.student || progress.applicantId || progress.applicantCode);
}
