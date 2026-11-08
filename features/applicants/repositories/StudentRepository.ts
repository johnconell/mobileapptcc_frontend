import { STORAGE_KEYS } from '@/shared/constants';
import { apiRequest } from '@/shared/services/api';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { appStorage } from '@/shared/services/storage';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import type { Program, StudentRecord } from '@/shared/types';

/**
 * StudentRepository — legacy name-list selection is retired.
 * Live student admission is passkey-based.
 */
export const StudentRepository = {
  async getAll(): Promise<StudentRecord[]> {
    const code = await appStorage.getItem(STORAGE_KEYS.examinationCode);
    if (!code) return [];

    if (await OfflineStore.isOfflineMode()) {
      const scheduleId =
        (await appStorage.getItem(STORAGE_KEYS.offlineScheduleId)) ||
        String(OfflineExamRepository.parseOfflineCode(code) || '');
      if (!scheduleId) return [];
      return OfflineExamRepository.getStudentsForSchedule(scheduleId);
    }

    throw new Error('Student name selection is retired. Enter the examination passkey.');
  },

  async search(query: string): Promise<StudentRecord[]> {
    const all = await this.getAll();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.programName.toLowerCase().includes(q),
    );
  },

  async getById(id: string): Promise<StudentRecord | null> {
    const all = await this.getAll();
    return all.find((s) => s.id === id) ?? null;
  },

  /** Soft-claim a name so it shows Ready (green) and cannot be taken by others. */
  async claimStudent(student: StudentRecord): Promise<StudentRecord> {
    if (await OfflineStore.isOfflineMode()) {
      await OfflineStore.setLocalClaim(student.id);
      return {
        ...student,
        selectionStatus: 'ready',
        statusLabel: 'Ready',
        selectable: false,
      };
    }

    throw new Error('Student name selection is retired. Enter the examination passkey.');
  },

  async releaseClaim(studentId: string): Promise<void> {
    if (await PeerExamClient.isActive()) {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (token) {
        // Peer mode registration is tied to the proctor phone session.
        // We call /leave or /remove (implementation depends on server routes).
        try {
          await PeerExamClient.request('/leave', {
            method: 'POST',
            body: { participation_token: token },
          });
        } catch (e) {
          // ignore error if server unreachable, we clear locally anyway in cancelRegistration
        }
      }
      return;
    }

    if (await OfflineStore.isOfflineMode()) {
      await OfflineStore.clearLocalClaim(studentId);
      return;
    }

    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return;

    await apiRequest('/exam/cancel', {
      method: 'POST',
      body: { participation_token: token },
    });
  },

  /**
   * Cancel waiting-lobby registration so the student can pick a different name.
   * Clears local participation tokens after a successful server release.
   */
  async cancelRegistration(studentId: string): Promise<void> {
    await this.releaseClaim(studentId);
    await appStorage.deleteItem(STORAGE_KEYS.participationToken);
    await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
  },

  async getPrograms(): Promise<Program[]> {
    const all = await this.getAll();
    const map = new Map<string, Program>();
    all.forEach((s) => {
      if (!s.programCode) return;
      map.set(s.programCode, {
        id: s.programCode,
        code: s.programCode,
        name: s.programName || s.programCode,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  },
};
