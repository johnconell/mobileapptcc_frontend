import type { AuthorityStatus } from '@/services/examAuthority';

export type StartPulse = {
  roomStatus: string;
  authorityStatus?: string;
  startSeq?: number;
};

export function parseStartPulse(raw: unknown): StartPulse | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const authority = data.authorityStatus != null ? String(data.authorityStatus) : undefined;
  let roomStatus = String(data.roomStatus ?? data.status ?? '').trim();
  if (!roomStatus && authority === 'ACTIVE') roomStatus = 'in_progress';
  if (!roomStatus && authority === 'ENDED') roomStatus = 'ended';
  if (!roomStatus) return null;
  return {
    roomStatus,
    authorityStatus: authority,
    startSeq: data.startSeq != null ? Number(data.startSeq) : undefined,
  };
}

export function shouldNavigateToExam(input: {
  authority: AuthorityStatus;
  moduleReady: boolean;
  hashVerified: boolean;
  percent: number;
  alreadyEntered: boolean;
}): boolean {
  if (input.alreadyEntered) return false;
  if (input.authority === 'ENDED') return false;
  if (input.authority !== 'ACTIVE') return false;
  return input.moduleReady && input.hashVerified && input.percent >= 100;
}

export function resolveRouteUuid(event: { uuid?: string; routeUuid?: string }): string {
  if (event.routeUuid) return event.routeUuid;
  const uuid = String(event.uuid ?? '');
  const sep = uuid.indexOf(':');
  return sep === -1 ? uuid : uuid.slice(0, sep);
}

export function simulateStartPropagation(input: {
  serverStatus: 'lobby_open' | 'in_progress' | 'ended';
  moduleReady: boolean;
  students: number;
}): { navigated: number; authority: AuthorityStatus } {
  const authority =
    input.serverStatus === 'in_progress'
      ? 'ACTIVE'
      : input.serverStatus === 'ended'
        ? 'ENDED'
        : 'WAITING';
  let navigated = 0;
  for (let i = 0; i < input.students; i += 1) {
    if (
      shouldNavigateToExam({
        authority,
        moduleReady: input.moduleReady,
        hashVerified: input.moduleReady,
        percent: input.moduleReady ? 100 : 0,
        alreadyEntered: false,
      })
    ) {
      navigated += 1;
    }
  }
  return { navigated, authority };
}

export const STUDENT_MONITOR_INTERVAL_MS = 2000;
export const MAX_SUPPORTED_STUDENTS = 60;
