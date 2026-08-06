import { create } from 'zustand';
import type { StudentRecord } from '@/types';

interface StudentState {
  scannedSessionId: string | null;
  scannedScheduleId: string | null;
  selectedStudent: StudentRecord | null;
  verifiedStudent: StudentRecord | null;
  examPasskey: string | null;
  setScannedSession: (scheduleId: string, sessionId: string) => void;
  setSelectedStudent: (student: StudentRecord | null) => void;
  setVerifiedStudent: (student: StudentRecord | null) => void;
  setExamPasskey: (passkey: string | null) => void;
  reset: () => void;
}

export const useStudentStore = create<StudentState>((set) => ({
  scannedSessionId: null,
  scannedScheduleId: null,
  selectedStudent: null,
  verifiedStudent: null,
  examPasskey: null,
  setScannedSession: (scannedScheduleId, scannedSessionId) =>
    set({ scannedScheduleId, scannedSessionId }),
  setSelectedStudent: (selectedStudent) => set({ selectedStudent }),
  setVerifiedStudent: (verifiedStudent) => set({ verifiedStudent }),
  setExamPasskey: (examPasskey) => set({ examPasskey }),
  reset: () =>
    set({
      scannedSessionId: null,
      scannedScheduleId: null,
      selectedStudent: null,
      verifiedStudent: null,
      examPasskey: null,
    }),
}));
