import { makeLocalFixtures, type LocalApiState } from './fixtures';
import { STORAGE_KEYS } from '@/shared/constants';

export const LOCAL_DATA_KEY = 'tcc.local-api.v1.data';
type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};
let storage: StorageAdapter = {
  async getItem(key) { return (await import('@/shared/services/storage')).appStorage.getItem(key); },
  async setItem(key, value) { return (await import('@/shared/services/storage')).appStorage.setItem(key, value); },
  async deleteItem(key) { return (await import('@/shared/services/storage')).appStorage.deleteItem(key); },
};

/** Test-only seam; production always uses the app's platform storage adapter. */
export function setLocalApiStorageForTests(adapter: StorageAdapter): void {
  storage = adapter;
}

export async function loadLocalApiState(): Promise<LocalApiState> {
  const raw = await storage.getItem(LOCAL_DATA_KEY);
  if (!raw) {
    const seeded = makeLocalFixtures();
    await saveLocalApiState(seeded);
    return seeded;
  }
  try {
    const stored = JSON.parse(raw) as LocalApiState;
    const current = makeLocalFixtures();
    if (stored.fixtureVersion !== current.fixtureVersion) {
      current.attempts = stored.attempts ?? {};
      await saveLocalApiState(current);
      return current;
    }
    return stored;
  } catch {
    const seeded = makeLocalFixtures();
    await saveLocalApiState(seeded);
    return seeded;
  }
}

export async function saveLocalApiState(state: LocalApiState): Promise<void> {
  await storage.setItem(LOCAL_DATA_KEY, JSON.stringify(state));
}

export async function resetLocalApiData(): Promise<void> {
  await Promise.all([
    LOCAL_DATA_KEY,
    STORAGE_KEYS.localProctorSession,
    STORAGE_KEYS.localProctorToken,
    STORAGE_KEYS.participationToken,
    STORAGE_KEYS.studentProgress,
    STORAGE_KEYS.examCheckpoint,
    STORAGE_KEYS.examinationCode,
    STORAGE_KEYS.offlineMode,
  ].map((key) => storage.deleteItem(key)));
}

export type SeedResult = {
  scheduleTitle: string;
  timeSlot: string;
  roomName: string;
  capacity: number;
  examineesCount: number;
  questionsCount: number;
  proctorName: string;
};

export async function seedLocalTestData(options?: {
  useCurrentTimeWindow?: boolean;
  proctorId?: number;
}): Promise<SeedResult> {
  const current = await loadLocalApiState();
  const seeded = makeLocalFixtures(new Date(), {
    useCurrentTimeWindow: options?.useCurrentTimeWindow ?? true,
  });

  // Preserve existing student attempts and completed answers
  seeded.attempts = current.attempts ?? {};
  seeded.sessionStatus = current.sessionStatus ?? { '101': 'idle', '102': 'idle', '103': 'idle' };

  await saveLocalApiState(seeded);

  const proctorId = options?.proctorId ?? 901;
  const currentProctor = seeded.proctors.find((p) => p.id === proctorId) || seeded.proctors[0];

  // Save the OfflinePack into OfflineStore for Peer LAN hosting
  const { OfflineStore } = await import('@/features/synchronization/services/offlineStore');
  const { makeOfflinePackFromLocalState } = await import('./fixtures');
  const pack = makeOfflinePackFromLocalState(seeded, currentProctor.id);
  await OfflineStore.savePack(pack);

  const sched = seeded.schedules.find((s) => Number(s.id) === (currentProctor.id === 901 ? 101 : 102)) ?? seeded.schedules[0];
  const room = seeded.rooms.find((r) => Number(r.assigned_proctor_id) === currentProctor.id) ?? seeded.rooms[0];

  return {
    scheduleTitle: String(sched.title),
    timeSlot: String(sched.time_slot),
    roomName: String(room.room_name),
    capacity: Number(room.capacity),
    examineesCount: pack.applicants.length,
    questionsCount: seeded.questions.length,
    proctorName: currentProctor.name,
  };
}

