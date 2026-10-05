import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import { apiRequest } from '@/shared/services/api';

export type StudentDisconnectReason =
  | 'wifi_lost'
  | 'wrong_network'
  | 'proctor_network_change'
  | 'proctor_removed'
  | 'session_ended'
  | 'proctor_unreachable_exit';

type StudentDisconnectEntry = {
  id: string;
  reason: StudentDisconnectReason;
  occurredAt: string;
  participationToken: string;
  sessionId: string | null;
};

const MAX_PENDING_ENTRIES = 100;
let isSyncing = false;

async function readPending(): Promise<StudentDisconnectEntry[]> {
  try {
    const raw = await appStorage.getItem(STORAGE_KEYS.pendingStudentDisconnects);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as StudentDisconnectEntry[]) : [];
  } catch {
    return [];
  }
}

export async function recordStudentDisconnect(
  reason: StudentDisconnectReason,
  participationToken: string,
  sessionId: string | null,
): Promise<void> {
  if (!participationToken) return;

  const pending = await readPending();
  const now = Date.now();
  const entry: StudentDisconnectEntry = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    reason,
    occurredAt: new Date(now).toISOString(),
    participationToken,
    sessionId,
  };

  try {
    await appStorage.setItem(
      STORAGE_KEYS.pendingStudentDisconnects,
      JSON.stringify([...pending, entry].slice(-MAX_PENDING_ENTRIES)),
    );
  } catch {
    // The exit path must still work if secure local storage is unavailable.
  }
}

export async function syncStudentDisconnects(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const pending = await readPending();
    let remaining = [...pending];
    for (const entry of pending) {
      try {
        await apiRequest('/exam/wifi-disconnect', {
          method: 'POST',
          auth: false,
          body: {
            participation_token: entry.participationToken,
            local_event_id: entry.id,
            reason: entry.reason,
            occurred_at: entry.occurredAt,
            session_id: entry.sessionId,
          },
        });
        remaining = remaining.filter((candidate) => candidate.id !== entry.id);
        await appStorage.setItem(
          STORAGE_KEYS.pendingStudentDisconnects,
          JSON.stringify(remaining),
        );
      } catch {
        // Keep unsent entries and retry after the next network change/app resume.
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}
