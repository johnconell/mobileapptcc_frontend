import { delay } from '@/utils';
import studentsData from '@/mock/data/students.json';
import programsData from '@/mock/data/programs.json';
import type { Program, StudentRecord } from '@/types';

/**
 * StudentRepository — mock student directory.
 * Future Laravel: GET /api/students?q=, GET /api/programs
 */
export const StudentRepository = {
  async getAll(): Promise<StudentRecord[]> {
    await delay(350);
    return studentsData as StudentRecord[];
  },

  async search(query: string): Promise<StudentRecord[]> {
    await delay(250);
    const q = query.trim().toLowerCase();
    const all = studentsData as StudentRecord[];
    if (!q) return all;
    return all.filter(
      (student) =>
        student.fullName.toLowerCase().includes(q) ||
        student.email.toLowerCase().includes(q) ||
        student.studentId.toLowerCase().includes(q) ||
        student.programCode.toLowerCase().includes(q),
    );
  },

  async getById(id: string): Promise<StudentRecord | null> {
    await delay(200);
    return (studentsData as StudentRecord[]).find((s) => s.id === id) ?? null;
  },

  async getPrograms(): Promise<Program[]> {
    await delay(150);
    return programsData as Program[];
  },
};
