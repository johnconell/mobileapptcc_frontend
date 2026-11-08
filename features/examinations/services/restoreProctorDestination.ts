import { PeerExamServer } from '@/features/examinations/services/peerExamServer';

export type ProctorRestoreResult =
  | { route: '/(proctor)/(tabs)/dashboard'; recoveryMessage?: string }
  | { route: string; recoveryMessage?: string };

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
  if (!restored || !info.running) {
    return {
      route: '/(proctor)/(tabs)/dashboard',
      recoveryMessage:
        'Your previous examination room was found, but its local host could not be restarted. Reconnect to the examination network, then reopen the room to recover it.',
    };
  }

  const sessionId = String(snapshot.session?.id || snapshot.schedule?.id || '');
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

  return { route: `/(proctor)/lobby?${params.toString()}` };
}
