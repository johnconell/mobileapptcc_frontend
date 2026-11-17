import { PeerExamServer } from '@/features/examinations/services/peerExamServer';

export type ProctorRestoreResult =
  | { route: '/(proctor)/(tabs)/dashboard'; recoveryMessage?: string }
  | { route: string; recoveryMessage?: string };

/** Route the lobby by schedule identity, never by its composite local session id. */
export function restoredScheduleRouteId(snapshot: {
  schedule?: { id?: string | number | null } | null;
  session?: { scheduleId?: string | number | null; id?: string | number | null } | null;
}): string {
  const scheduleId = snapshot.schedule?.id ?? snapshot.session?.scheduleId;
  if (scheduleId != null && String(scheduleId).trim()) return String(scheduleId).replace(/^offline-/, '');
  const localSessionId = String(snapshot.session?.id ?? '').replace(/^offline-/, '');
  return localSessionId.match(/^\d+/)?.[0] ?? '';
}

/**
 * Rebind a persisted peer room after process death and return the exact screen
 * the proctor was managing. This never creates a room or regenerates its code.
 */
export async function restoreProctorDestination(): Promise<ProctorRestoreResult> {
  const restored = await PeerExamServer.restore();
  const snapshot = await PeerExamServer.snapshot();

  if (!snapshot || snapshot.status === 'ended') {
    return { route: '/(proctor)/(tabs)/dashboard' };
  }

  const info = PeerExamServer.info();
  if (!restored) {
    return {
      route: '/(proctor)/(tabs)/dashboard',
      recoveryMessage:
        'Your previous examination room could not be restored from secure local storage. Reconnect to the examination network, then reopen the room to recover it.',
    };
  }

  const sessionId = restoredScheduleRouteId(snapshot);
  if (!sessionId) {
    return {
      route: '/(proctor)/(tabs)/dashboard',
      recoveryMessage:
        'Your previous examination room was found, but its saved session details are incomplete. Open the Examination tab to recover the room.',
    };
  }

  const params = new URLSearchParams({
    sessionId,
    scheduleId: String(snapshot.schedule?.id || snapshot.session?.scheduleId || ''),
  });
  if (snapshot.roomId != null) params.set('roomId', String(snapshot.roomId));
  if (snapshot.session?.examSessionId != null) {
    params.set('examSessionId', String(snapshot.session.examSessionId));
  }

  return {
    route: `/(proctor)/lobby?${params.toString()}`,
    recoveryMessage: info.running
      ? undefined
      : info.host
        ? 'The saved examination was restored. Reconnecting the local LAN listener; the original timer and student progress remain unchanged.'
        : 'The saved examination was restored. Connect the proctor phone to Wi-Fi to make the local LAN available. The original timer and student progress remain unchanged.',
  };
}
