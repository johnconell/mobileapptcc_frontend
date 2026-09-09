import { appStorage } from '@/services/storage';
import { canReplace, mapServerToAuthority, type AuthorityStatus } from '@/services/examAuthority';

export type { AuthorityStatus };
export { canReplace, mapServerToAuthority };

export type StartPhase = 'waiting' | 'received' | 'entered';

type AuthorityRecord = {
  status: AuthorityStatus;
  sessionId: string | null;
  startedAt: string | null;
  updatedAt: number;
  startSeq: number;
};

const STORAGE_KEY = 'tcc.exam.authority.status';

let memory: AuthorityRecord = {
  status: 'WAITING',
  sessionId: null,
  startedAt: null,
  updatedAt: 0,
  startSeq: 0,
};

let hydrated = false;
const listeners = new Set<(record: AuthorityRecord) => void>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(memory);
    } catch {
      /* ignore */
    }
  });
}

export const ExamLifecycle = {
  peek(): AuthorityRecord {
    return memory;
  },

  subscribe(listener: (record: AuthorityRecord) => void): () => void {
    listeners.add(listener);
    listener(memory);
    return () => {
      listeners.delete(listener);
    };
  },

  async hydrate(): Promise<AuthorityRecord> {
    if (hydrated) return memory;
    hydrated = true;
    try {
      const raw = await appStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthorityRecord;
        if (parsed?.status && canReplace(memory.status, parsed.status)) {
          memory = { ...memory, ...parsed };
        }
      }
    } catch {
      /* keep defaults */
    }
    emit();
    return memory;
  },

  resetForTests(): void {
    memory = {
      status: 'WAITING',
      sessionId: null,
      startedAt: null,
      updatedAt: 0,
      startSeq: 0,
    };
    hydrated = true;
    listeners.clear();
  },

  async apply(
    incoming: AuthorityStatus,
    extras: Partial<Pick<AuthorityRecord, 'sessionId' | 'startedAt' | 'startSeq'>> = {},
  ): Promise<AuthorityRecord> {
    await this.hydrate();
    if (!canReplace(memory.status, incoming)) {
      console.log(
        `[LIFECYCLE] Ignored stale ${incoming} (current ${memory.status})`,
      );
      return memory;
    }
    memory = {
      ...memory,
      status: incoming,
      sessionId: extras.sessionId ?? memory.sessionId,
      startedAt:
        incoming === 'ACTIVE' || incoming === 'STARTING'
          ? extras.startedAt ?? memory.startedAt ?? new Date().toISOString()
          : extras.startedAt ?? memory.startedAt,
      updatedAt: Date.now(),
      startSeq: extras.startSeq ?? memory.startSeq,
    };
    await appStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    emit();
    return memory;
  },

  async applyFromServer(
    roomStatus?: string | null,
    extras: Partial<Pick<AuthorityRecord, 'sessionId' | 'startedAt' | 'startSeq'>> = {},
  ): Promise<AuthorityRecord> {
    return this.apply(mapServerToAuthority(roomStatus), extras);
  },

  async clear(): Promise<void> {
    memory = {
      status: 'WAITING',
      sessionId: null,
      startedAt: null,
      updatedAt: 0,
      startSeq: 0,
    };
    hydrated = true;
    await appStorage.deleteItem(STORAGE_KEY);
    emit();
  },
};
