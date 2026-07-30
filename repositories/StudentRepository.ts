import { STORAGE_KEYS } from '@/constants';
import { apiRequest } from '@/services/api';
import { appStorage } from '@/services/storage';
import type { Program, StudentRecord } from '@/types';

/**
 * StudentRepository — applicants registered to the active exam schedule.
 * GET /api/v1/exam/students?code=
 */
export const StudentRepository = {
  async getAll(): Promise<StudentRecord[]> {
    const code = await appStorage.getItem(STORAGE_KEYS.examinationCode);
    if (!code) return [];
    const json = await apiRequest<{ success: boolean; data: StudentRecord[] }>(
      `/exam/students?code=${encodeURIComponent(code)}`,
      { auth: false },
    );
    return json.data || [];
  },

  async search(query: string): Promise<StudentRecord[]> {
    const code = await appStorage.getItem(STORAGE_KEYS.examinationCode);
    if (!code) return [];
    const q = query.trim();
    const json = await apiRequest<{ success: boolean; data: StudentRecord[] }>(
      `/exam/students?code=${encodeURIComponent(code)}${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      { auth: false },
    );
    return json.data || [];
  },

  async getById(id: string): Promise<StudentRecord | null> {
    const all = await this.getAll();
    return all.find((s) => s.id === id) ?? null;
  },

  /** Soft-claim a name so it shows Ready (green) and cannot be taken by others. */
  async claimStudent(student: StudentRecord): Promise<StudentRecord> {
    const code = await appStorage.getItem(STORAGE_KEYS.examinationCode);
    if (!code) throw new Error('Missing examination code. Scan QR again.');

    const json = await apiRequest<{
      success: boolean;
      message?: string;
      data?: { registration_id: number; selectionStatus: string };
    }>('/exam/claim', {
      method: 'POST',
      auth: false,
      body: {
        code,
        applicant_id: Number(student.id),
      },
    });

    if (!json.success) {
      throw new Error(json.message || 'Unable to select this student.');
    }

    return {
      ...student,
      selectionStatus: 'ready',
      statusLabel: 'Ready',
      selectable: false,
      registration_id: json.data?.registration_id ?? student.registration_id,
    };
  },

  async releaseClaim(studentId: string): Promise<void> {
    const code = await appStorage.getItem(STORAGE_KEYS.examinationCode);
    if (!code) return;

    await apiRequest('/exam/release-claim', {
      method: 'POST',
      auth: false,
      body: {
        code,
        applicant_id: Number(studentId),
      },
    }).catch(() => undefined);
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
