import { create } from 'zustand';
import { ExamLifecycle } from '@/services/examLifecycle';
import type { LobbySnapshot } from '@/types';

interface LobbyState {
  snapshot: LobbySnapshot | null;
  isLoading: boolean;
  setSnapshot: (snapshot: LobbySnapshot | null) => void;
  setLoading: (value: boolean) => void;
  reset: () => void;
}

function protectSnapshot(snapshot: LobbySnapshot): LobbySnapshot {
  const authority = ExamLifecycle.peek().status;
  if (authority === 'ENDED' && snapshot.status !== 'ended') {
    return { ...snapshot, status: 'ended' };
  }
  if (
    (authority === 'ACTIVE' || authority === 'STARTING' || authority === 'PAUSED') &&
    snapshot.status === 'lobby_open'
  ) {
    return { ...snapshot, status: 'in_progress' };
  }
  return snapshot;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  snapshot: null,
  isLoading: false,
  setSnapshot: (snapshot) => set({ snapshot: snapshot ? protectSnapshot(snapshot) : null }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ snapshot: null, isLoading: false }),
}));
