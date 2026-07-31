import { apiRequest } from '@/services/api';
import { LobbyRepository } from '@/repositories/LobbyRepository';
import type { ExamCodeValidation, ExamRoom, ExamSchedule, ExamSession } from '@/types';

type BackendSchedule = {
  id: number;
  title?: string;
  exam_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  time_slot?: string | null;
  venue?: string | null;
  batch_code?: string | null;
  course?: string | null;
  status?: string;
  expected_examinees?: number;
  registrations_count?: number;
};

type BackendRoom = {
  id: number;
  room_name: string;
  capacity: number;
  proctor_id?: number | null;
  proctor_name?: string | null;
  exam_session_id?: number | null;
  examination_code?: string | null;
  status?: string;
  connected_count?: number;
  can_reopen?: boolean;
};

function formatDateLabel(iso?: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  try {
    return new Date(`1970-01-01T${raw}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return raw;
  }
}

function toMobileSession(row: BackendSchedule): ExamSession {
  const examDate = row.exam_date || '';
  const timeLabel =
    row.time_slot ||
    [formatTime(row.start_time), formatTime(row.end_time)].filter(Boolean).join('–');

  return {
    id: String(row.id),
    scheduleId: `date-${examDate}`,
    timeLabel,
    startTime: formatTime(row.start_time),
    endTime: formatTime(row.end_time),
    venue: row.venue || 'TBD',
    batchNumber: row.batch_code || `Batch ${row.id}`,
    registeredStudents: Number(row.registrations_count ?? row.expected_examinees ?? 0),
    durationMinutes: 90,
    totalQuestions: 0,
  };
}

function toMobileRoom(row: BackendRoom, scheduleId: string): ExamRoom {
  return {
    id: String(row.id),
    scheduleId,
    roomName: row.room_name,
    capacity: Number(row.capacity ?? 0),
    examSessionId: row.exam_session_id ?? null,
    examinationCode: row.examination_code ?? null,
    status: row.status || 'idle',
    connectedCount: Number(row.connected_count ?? 0),
    proctorId: row.proctor_id ?? null,
    proctorName: row.proctor_name ?? null,
    canReopen: row.can_reopen !== false,
  };
}

function toMobileSchedules(rows: BackendSchedule[]): ExamSchedule[] {
  const map = new Map<string, ExamSchedule & { _count: number }>();
  rows.forEach((row) => {
    const date = row.exam_date || 'unknown';
    const key = `date-${date}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: row.title || 'Entrance Examination',
        schoolYear: date.slice(0, 4) || String(new Date().getFullYear()),
        examinationDate: formatDateLabel(date),
        examinationDateIso: date,
        batchCount: 0,
        description: row.course || undefined,
        _count: 0,
      });
    }
    const item = map.get(key)!;
    item._count += 1;
    item.batchCount = item._count;
  });
  return Array.from(map.values())
    .map(({ _count, ...rest }) => rest)
    .sort((a, b) => String(b.examinationDateIso).localeCompare(String(a.examinationDateIso)));
}

/**
 * ScheduleRepository — Laravel examination schedules.
 * GET /api/v1/proctor/schedules
 */
export const ScheduleRepository = {
  async getSchedules(): Promise<ExamSchedule[]> {
    const json = await apiRequest<{ success: boolean; data: BackendSchedule[] }>(
      '/proctor/schedules?per_page=200',
    );
    return toMobileSchedules(json.data || []);
  },

  async getScheduleById(id: string): Promise<ExamSchedule | null> {
    const all = await this.getSchedules();
    return all.find((item) => item.id === id) ?? null;
  },

  async getSessionsBySchedule(scheduleId: string): Promise<ExamSession[]> {
    const date = scheduleId.startsWith('date-') ? scheduleId.slice(5) : scheduleId;
    const json = await apiRequest<{ success: boolean; data: BackendSchedule[] }>(
      `/proctor/schedules?per_page=200${date ? `&date=${encodeURIComponent(date)}` : ''}`,
    );
    return (json.data || [])
      .map(toMobileSession)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  },

  async getRoomsBySession(sessionId: string): Promise<ExamRoom[]> {
    const json = await apiRequest<{ success: boolean; data: BackendRoom[] }>(
      `/proctor/schedules/${sessionId}/rooms`,
    );
    return (json.data || []).map((row) => toMobileRoom(row, sessionId));
  },

  async getSessionById(id: string): Promise<ExamSession | null> {
    const json = await apiRequest<{ success: boolean; data: BackendSchedule }>(
      `/examination-schedules/${id}`,
    );
    return json.data ? toMobileSession(json.data) : null;
  },

  async resolveSessionFromQr(raw: string): Promise<ExamCodeValidation> {
    return LobbyRepository.verifyExaminationCode(raw.trim());
  },
};
