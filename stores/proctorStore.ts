import { create } from 'zustand';
import type { ExamSchedule, ExamSession, ProctorProfile } from '@/types';

interface ProctorState {
  profile: ProctorProfile | null;
  selectedSchedule: ExamSchedule | null;
  selectedSession: ExamSession | null;
  proctorHidden: boolean;
  setProfile: (profile: ProctorProfile | null) => void;
  setSelectedSchedule: (schedule: ExamSchedule | null) => void;
  setSelectedSession: (session: ExamSession | null) => void;
  setProctorHidden: (hidden: boolean) => void;
  toggleProctorHidden: () => void;
  reset: () => void;
}

export const useProctorStore = create<ProctorState>((set) => ({
  profile: null,
  selectedSchedule: null,
  selectedSession: null,
  proctorHidden: false,
  setProfile: (profile) => set({ profile }),
  setSelectedSchedule: (selectedSchedule) => set({ selectedSchedule }),
  setSelectedSession: (selectedSession) => set({ selectedSession }),
  setProctorHidden: (hidden) => set({ proctorHidden: hidden }),
  toggleProctorHidden: () => set((s) => ({ proctorHidden: !s.proctorHidden })),
  reset: () => set({ profile: null, selectedSchedule: null, selectedSession: null }),
}));
