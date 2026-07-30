import { create } from 'zustand';
import type { LobbySnapshot } from '@/types';

interface LobbyState {
  snapshot: LobbySnapshot | null;
  isLoading: boolean;
  setSnapshot: (snapshot: LobbySnapshot | null) => void;
  setLoading: (value: boolean) => void;
  reset: () => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  snapshot: null,
  isLoading: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ snapshot: null, isLoading: false }),
}));
