import { create } from 'zustand';
import type { StudentRecord } from '@/shared/types';

interface StudentState {
  scannedSessionId: string | null;
  scannedScheduleId: string | null;
  selectedStudent: StudentRecord | null;
  verifiedStudent: StudentRecord | null;
  examPasskey: string | null;
  /** Timestamp (ISO string) when the student agreed to the exam terms. Null if not yet agreed. */
  agreedAt: string | null;
  setScannedSession: (scheduleId: string, sessionId: string) => void;
  setSelectedStudent: (student: StudentRecord | null) => void;
  setVerifiedStudent: (student: StudentRecord | null) => void;
  setExamPasskey: (passkey: string | null) => void;
  setAgreedAt: (timestamp: string | null) => void;
  reset: () => void;
}

export const useStudentStore = create<StudentState>((set) => ({
  scannedSessionId: null,
  scannedScheduleId: null,
  selectedStudent: null,
  verifiedStudent: null,
  examPasskey: null,
  agreedAt: null,
  setScannedSession: (scannedScheduleId, scannedSessionId) =>
    set({ scannedScheduleId, scannedSessionId }),
  setSelectedStudent: (selectedStudent) => set({ selectedStudent }),
  setVerifiedStudent: (verifiedStudent) => set({ verifiedStudent }),
  setExamPasskey: (examPasskey) => set({ examPasskey }),
  setAgreedAt: (agreedAt) => set({ agreedAt }),
  reset: () =>
    set({
      scannedSessionId: null,
      scannedScheduleId: null,
      selectedStudent: null,
      verifiedStudent: null,
      examPasskey: null,
      agreedAt: null,
    }),
}));
