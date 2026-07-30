import { create } from 'zustand';
import type { ExamSchedule, ExamSession, ProctorProfile } from '@/types';

interface ProctorState {
  profile: ProctorProfile | null;
  selectedSchedule: ExamSchedule | null;
  selectedSession: ExamSession | null;
  setProfile: (profile: ProctorProfile | null) => void;
  setSelectedSchedule: (schedule: ExamSchedule | null) => void;
  setSelectedSession: (session: ExamSession | null) => void;
  reset: () => void;
}

export const useProctorStore = create<ProctorState>((set) => ({
  profile: null,
  selectedSchedule: null,
  selectedSession: null,
  setProfile: (profile) => set({ profile }),
  setSelectedSchedule: (selectedSchedule) => set({ selectedSchedule }),
  setSelectedSession: (selectedSession) => set({ selectedSession }),
  reset: () => set({ profile: null, selectedSchedule: null, selectedSession: null }),
}));
