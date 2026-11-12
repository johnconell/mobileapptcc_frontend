import * as Network from 'expo-network';
import { ApiError, apiRequest } from '@/shared/services/api';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { appStorage } from '@/shared/services/storage';
import type { ExamCodeValidation, ExamRoom, ExamSchedule, ExamSession } from '@/shared/types';
import {
  getProctorScheduleAvailability,
  isPersistedOpenedRoomActive,
} from '@/features/schedules/utils/proctorScheduleWindow';

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
  rooms_count?: number;
  completed_rooms_count?: number;
  session_type?: 'regular' | 'rescheduled';
  reschedule_state?: 'proposed' | 'confirmed' | 'review_required' | null;
  schedule_revision?: number;
};

const SCHEDULE_CATALOG_KEY = 'tcc.offline.schedule.catalog';
let serverClockSample: { serverMs: number; monotonicMs: number | null } | null = null;

function monotonicNow(): number | null {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : null;
}

export function getServerClockEstimate(): number | null {
  if (!serverClockSample) return null;
  const monotonicMs = monotonicNow();
  if (monotonicMs === null || serverClockSample.monotonicMs === null) {
    return serverClockSample.serverMs;
  }
  return serverClockSample.serverMs + Math.max(0, monotonicMs - serverClockSample.monotonicMs);
}

type BackendRoom = {
  id: number;
  room_name: string;
  capacity: number;
  student_count?: number;
  proctor_id?: number | null;
  proctor_name?: string | null;
  assigned_proctor_id?: number | null;
  assigned_proctor_name?: string | null;
  owner_id?: number | null;
  owner_name?: string | null;
  can_open?: boolean;
  can_control?: boolean;
  exam_session_id?: number | null;
  examination_code?: string | null;
  status?: string;
  connected_count?: number;
  can_reopen?: boolean;
  claim_required?: boolean;
  authorization_reason?: string | null;
};

function formatDateLabel(iso?: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return raw;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minutes > 59 || hours > 23 || (period && hours > 12)) return raw;
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function formatTimeRange(value?: string | null): string {
  if (!value) return '';
  const parts = String(value).split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return String(value);
  const [start, end] = parts.map(formatTime);
  return start && end ? `${start} – ${end}` : String(value);
}

function toMobileSession(row: BackendSchedule): ExamSession {
  const examDate = row.exam_date || '';
  const title = row.title || 'Entrance Examination';
  const timeLabel =
    formatTimeRange(row.time_slot) ||
    [formatTime(row.start_time), formatTime(row.end_time)].filter(Boolean).join('–');

  return {
    id: String(row.id),
    scheduleId: `date-${examDate}-${title.replace(/\s+/g, '-')}`,
    timeLabel,
    startTime: formatTime(row.start_time),
    endTime: formatTime(row.end_time),
    venue: row.venue || 'Room assignment available in the downloaded pack',
    batchNumber: row.batch_code || `Batch ${row.id}`,
    registeredStudents: Number(row.registrations_count ?? row.expected_examinees ?? 0),
    durationMinutes: 60,
    totalQuestions: 0,
    historyStatus:
      Number(row.completed_rooms_count ?? 0) > 0 || row.status === 'completed'
        ? 'completed'
        : 'missed',
    sessionType: row.session_type || 'regular',
    rescheduleState: row.reschedule_state ?? null,
    scheduleRevision: Number(row.schedule_revision ?? 1),
  };
}

function toMobileRoom(row: BackendRoom, scheduleId: string): ExamRoom {
  return {
    id: String(row.id),
    scheduleId,
    roomName: row.room_name,
    capacity: Number(row.capacity ?? 0),
    // Capacity is a room limit, not an assignment count. Falling back to it
    // made every room appear full when the API omitted student_count.
    studentCount: Number(row.student_count ?? 0),
    examSessionId: row.exam_session_id ?? null,
    examinationCode: row.examination_code ?? null,
    status: row.status || 'idle',
    connectedCount: Number(row.connected_count ?? 0),
    proctorId: row.proctor_id ?? null,
    proctorName: row.proctor_name ?? null,
    assignedProctorId: row.assigned_proctor_id ?? null,
    assignedProctorName: row.assigned_proctor_name ?? null,
    ownerId: row.owner_id ?? null,
    ownerName: row.owner_name ?? null,
    canOpen: row.can_open ?? false,
    canControl: row.can_control ?? false,
    canReopen: row.can_reopen !== false,
    claimRequired:
      row.claim_required ??
      (row.assigned_proctor_id == null && row.owner_id == null && row.can_open === true),
    authorizationReason: row.authorization_reason ?? null,
  };
}

function toMobileSchedules(rows: BackendSchedule[], serverNow?: string): ExamSchedule[] {
  const map = new Map<string, any>();
  rows.forEach((row) => {
    const date = row.exam_date || 'unknown';
    const title = row.title || 'Entrance Examination';
    const key = `date-${date}-${title.replace(/\s+/g, '-')}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: title,
        schoolYear: date.slice(0, 4) || String(new Date().getFullYear()),
        examinationDate: formatDateLabel(date),
        examinationDateIso: date,
        batchCount: 0,
        description: row.venue || row.course || undefined,
        timeLabel: row.time_slot || undefined,
        batchNumber: row.batch_code || undefined,
        venue: row.venue || undefined,
        serverNow,
      });
    }
    const item = map.get(key)!;
    item.batchCount += 1;

    if (item.batchCount > 1) {
      item.timeLabel = undefined;
      item.batchNumber = undefined;
    }
  });
  return Array.from(map.values())
    .sort((a, b) => String(b.examinationDateIso).localeCompare(String(a.examinationDateIso)));
}

/**
 * ScheduleRepository — Laravel examination schedules.
 * GET /api/v1/proctor/schedules
 */
export const ScheduleRepository = {
  async getSchedules(): Promise<ExamSchedule[]> {
    const [cachedPackSchedules, catalog] = await Promise.all([
      OfflineExamRepository.getCachedSchedules(),
      this.getSavedScheduleCatalog(),
    ]);
    const local = mergeSchedules(catalog, cachedPackSchedules);
    if (await OfflineStore.isOfflineMode()) return local;
    try {
      return await this.refreshSchedulesFromCloud();
    } catch {
      return local;
    }
  },

  async getLocalSchedules(): Promise<ExamSchedule[]> {
    const [cachedPackSchedules, catalog] = await Promise.all([
      OfflineExamRepository.getCachedSchedules(),
      this.getSavedScheduleCatalog(),
    ]);
    return mergeSchedules(
      catalog.filter((schedule) => schedule.offlineReady),
      cachedPackSchedules,
    );
  },

  async getSavedScheduleCatalog(): Promise<ExamSchedule[]> {
    try {
      const raw = await appStorage.getItem(SCHEDULE_CATALOG_KEY);
      return raw ? (JSON.parse(raw) as ExamSchedule[]) : [];
    } catch {
      return [];
    }
  },

  async refreshSchedulesFromCloud(): Promise<ExamSchedule[]> {
    const json = await apiRequest<{
      success: boolean;
      data: BackendSchedule[];
      meta?: { server_now?: string };
    }>(
      '/proctor/schedules?per_page=200&include_history=1',
    );
    const serverNow = json.meta?.server_now;
    const serverMs = serverNow ? Date.parse(serverNow) : NaN;
    if (Number.isFinite(serverMs)) {
      serverClockSample = { serverMs, monotonicMs: monotonicNow() };
    }
    const cloud = toMobileSchedules(json.data || [], serverNow);
    const cachedPackSchedules = await OfflineExamRepository.getCachedSchedules();
    // Keep a downloaded pack authoritative for offline use. The cloud catalog
    // may omit previously downloaded schedules (for example, after its
    // current-academic-year filter changes), and must not prune their local data.
    const merged = mergeSchedules(cloud, cachedPackSchedules);
    await appStorage.setItem(SCHEDULE_CATALOG_KEY, JSON.stringify(merged));
    return merged;
  },

  async getScheduleById(id: string): Promise<ExamSchedule | null> {
    const all = await this.getSchedules();
    return all.find((item) => item.id === id) ?? null;
  },

  async getSessionsBySchedule(scheduleId: string): Promise<ExamSession[]> {
    const fromPack = async (): Promise<ExamSession[]> => {
      const pack = await OfflineStore.getPack();
      if (!pack) {
        throw new Error('The offline examination package is missing. Download it before opening a room.');
      }

      let date: string | null = null;
      let title: string | null = null;

      if (scheduleId.startsWith('date-')) {
        // date-YYYY-MM-DD-title
        date = scheduleId.substring(5, 15);
        title = scheduleId.substring(16).replace(/-/g, ' ');
      }

      const rows = pack.schedules.filter((s) => {
        if (date && title) {
          return (s.exam_date || '') === date && (s.title || 'Entrance Examination') === title;
        }
        return String(s.id) === String(scheduleId).replace(/^offline-/, '');
      });
      if (!rows.length) {
        throw new Error('This examination schedule is missing from the offline package. Update the package before continuing.');
      }
      return rows
        .map((row) =>
          toMobileSession({
            id: row.id,
            title: row.title,
            exam_date: row.exam_date,
            start_time: row.start_time,
            end_time: row.end_time,
            time_slot: row.time_slot,
            venue: row.venue,
            batch_code: row.batch_code,
            course: row.course,
            status: row.status,
            session_type: row.session_type,
            reschedule_state: row.reschedule_state,
            schedule_revision: row.schedule_revision,
            registrations_count:
              row.registration_count ??
              pack.registrations.filter(
                (r) => Number(r.examination_schedule_id) === Number(row.id),
              ).length,
          }),
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    };

    const hasPack = await OfflineStore.hasPack();
    let localError: unknown = null;
    if (hasPack) {
      try {
        // The downloaded pack is the fast path even when the phone reports
        // internet access. Avoid one cloud request per cached schedule.
        return await fromPack();
      } catch (error) {
        localError = error;
      }
    }
    const networkState = await Network.getNetworkStateAsync().catch(() => null);
    if (hasPack && networkState?.isInternetReachable !== true) {
      throw localError instanceof Error
        ? localError
        : new Error('Cached examination times are unavailable. Reconnect and refresh the exam pack.');
    }

    try {
      let date = scheduleId;
      let title: string | null = null;

      if (scheduleId.startsWith('date-')) {
        date = scheduleId.substring(5, 15);
        title = scheduleId.substring(16).replace(/-/g, ' ');
      }

      const json = await apiRequest<{ success: boolean; data: BackendSchedule[] }>(
        `/proctor/schedules?per_page=200&include_history=1${date ? `&date=${encodeURIComponent(date)}` : ''}`,
      );

      const filtered = title
        ? (json.data || []).filter(s => (s.title || 'Entrance Examination') === title)
        : (json.data || []);

      return filtered
        .map(toMobileSession)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        throw new Error(error.message || 'This schedule is not in the current academic year and cannot be downloaded.');
      }
      if (hasPack) {
        await OfflineStore.setOfflineMode(true);
        if (localError) throw localError;
        return fromPack();
      }
      throw new Error('Unable to load examination times. Download the offline pack while online first.');
    }
  },

  async getRoomsBySession(sessionId: string): Promise<ExamRoom[]> {
    const fromPack = async (): Promise<ExamRoom[]> => {
      const pack = await OfflineStore.getPack();
      if (!pack) {
        throw new Error('The offline examination package is missing. Download it before opening a room.');
      }
      const sid = Number(String(sessionId).replace(/^offline-/, ''));
      const schedule = pack.schedules.find((s) => Number(s.id) === sid);
      if (!schedule) {
        throw new Error('This examination schedule is missing from the offline package. Update the package before continuing.');
      }
      if (!Array.isArray(schedule.rooms) || !schedule.rooms.length) {
        throw new Error('Room assignments are missing from the offline package. Update the package before opening a room.');
      }
      if (typeof schedule.rooms_managed !== 'boolean') {
        throw new Error('Room authorization data is outdated. Update the examination package before opening a room.');
      }
      const rooms = schedule.rooms;
      const opened = await OfflineStore.getOpenedRooms();
      const actorId = Number(pack.authorization?.actor_id ?? 0);
      const authorizationKnown =
        Number.isInteger(actorId) &&
        actorId > 0 &&
        Array.isArray(pack.authorization?.schedule_ids) &&
        pack.authorization.schedule_ids.some((id) => Number(id) === sid) &&
        typeof schedule.rooms_managed === 'boolean';
      const assignedRoomIds = rooms
        .filter((room) => Number(room.proctor_id) === actorId)
        .map((room) => Number(room.id));
      const nowMs = Date.now();
      const activeRoomKeys = Object.entries(opened)
        .filter(([key, value]) =>
          isPersistedOpenedRoomActive(pack.schedules, key, value.status, nowMs),
        )
        .map(([key]) => key);

      return rooms.map((row) => {
        const key = OfflineStore.roomKey(sid, row.id);
        const persisted = opened[key];
        const live = isPersistedOpenedRoomActive(
          pack.schedules,
          key,
          persisted?.status,
          nowMs,
        )
          ? persisted
          : undefined;
        const status = persisted && !live ? 'ended' : (live?.status ?? 'idle');
        const isLive = status === 'lobby_open' || status === 'in_progress';
        const liveOwnerId = live?.ownerId != null ? Number(live.ownerId) : null;
        const ownedByCurrent = Boolean(
          live && isLive && (liveOwnerId === actorId || liveOwnerId == null),
        );
        const ownedByOther = Boolean(
          live && isLive && liveOwnerId != null && liveOwnerId !== actorId,
        );
        const locallyClaimed = ownedByCurrent;

        const roomMetadataKnown =
          Object.prototype.hasOwnProperty.call(row, 'proctor_id') &&
          Number(row.examination_schedule_id) === sid;
        const assignedProctorId = row.proctor_id == null ? null : Number(row.proctor_id);
        const assignedToCurrent = assignedProctorId === actorId;
        const assignedToOther = (assignedProctorId != null && !assignedToCurrent) || ownedByOther;

        const hasOtherActiveRoom = activeRoomKeys.some((activeKey) => {
          if (activeKey === key) return false;
          const otherLive = opened[activeKey];
          return otherLive?.ownerId == null || Number(otherLive.ownerId) === actorId;
        });

        const unassignedEligible =
          assignedProctorId == null &&
          !ownedByOther &&
          assignedRoomIds.length === 0 &&
          !hasOtherActiveRoom;

        const canOpen =
          authorizationKnown &&
          roomMetadataKnown &&
          !assignedToOther &&
          !hasOtherActiveRoom &&
          status !== 'ended' &&
          getProctorScheduleAvailability(
            {
              date: schedule.exam_date || '',
              startTime: schedule.start_time,
              endTime: schedule.end_time,
              timeLabel: schedule.time_slot,
            },
            nowMs,
          ) === 'available' &&
          (assignedToCurrent || locallyClaimed || unassignedEligible);

        const claimRequired = unassignedEligible && !locallyClaimed;

        const assignedProctor = pack.proctors?.find((p) => Number(p.id) === assignedProctorId);
        const assignedProctorName = assignedProctor?.name ?? (assignedToCurrent ? 'You' : assignedProctorId != null ? `Proctor #${assignedProctorId}` : null);
        const ownerProctor = pack.proctors?.find((p) => Number(p.id) === (live?.ownerId ?? actorId));
        const ownerName = ownedByCurrent
          ? (ownerProctor?.name ?? 'You')
          : ownedByOther
            ? (live?.proctorName ?? pack.proctors?.find((p) => Number(p.id) === liveOwnerId)?.name ?? `Proctor #${liveOwnerId}`)
            : null;

        const authorizationReason = !authorizationKnown || !roomMetadataKnown
          ? 'Room assignment authorization is missing or outdated. Update the examination pack.'
          : assignedToOther
            ? 'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.'
            : hasOtherActiveRoom
              ? 'You already manage another active examination room.'
              : assignedProctorId == null && assignedRoomIds.length > 0
                ? 'You already have an assigned room for this examination schedule.'
                : null;

        return toMobileRoom(
          {
            id: row.id,
            room_name: row.room_name,
            capacity: row.capacity,
            student_count:
              row.student_count ??
              pack.registrations.filter(
                (registration) =>
                  Number(registration.examination_schedule_id) === sid &&
                  Number(registration.assigned_room_id) === Number(row.id),
              ).length,
            proctor_id: assignedProctorId,
            proctor_name: assignedProctorName,
            assigned_proctor_id: assignedProctorId,
            assigned_proctor_name: assignedProctorName,
            examination_code: live?.code ?? null,
            status,
            connected_count: 0,
            owner_id: ownedByCurrent ? actorId : liveOwnerId,
            owner_name: ownerName,
            can_open: canOpen,
            can_control: ownedByCurrent,
            claim_required: claimRequired,
            authorization_reason: authorizationReason,
            // Match Laravel ExamSessionService::roomsForSchedule —
            // idle/active rooms can open; ended rooms cannot reopen.
            can_reopen: status !== 'ended',
          },
          String(sid),
        );
      });
    };

    const hasPack = await OfflineStore.hasPack();
    const networkState = await Network.getNetworkStateAsync().catch(() => null);
    if (hasPack && networkState?.isInternetReachable !== true) {
      return fromPack();
    }

    try {
      const json = await apiRequest<{ success: boolean; data: BackendRoom[] }>(
        `/proctor/schedules/${sessionId}/rooms`,
      );
      const rooms = (json.data || []).map((row) => toMobileRoom(row, sessionId));

      // If we are online, also check for locally opened rooms (opened while offline)
      // and merge them so the proctor can "Enter Lobby" and resume synchronization.
      const opened = await OfflineStore.getOpenedRooms();
      const sid = Number(String(sessionId).replace(/^offline-/, ''));

      return rooms.map((room) => {
        const key = OfflineStore.roomKey(sid, room.id);
        const local = opened[key];
        // If the server thinks it's idle but we have a local open/started/ended session, prefer local.
        if (local && (room.status === 'idle' || room.status === 'scheduled')) {
          return {
            ...room,
            status: local.status,
            examinationCode: local.code,
          };
        }
        return room;
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        throw new Error(error.message || 'This schedule is not in the current academic year and cannot be downloaded.');
      }
      if (hasPack) {
        await OfflineStore.setOfflineMode(true);
        return fromPack();
      }
      throw new Error('Unable to load rooms. Download the offline pack while online first.');
    }
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

function mergeSchedules(
  preferred: ExamSchedule[],
  preserved: ExamSchedule[],
): ExamSchedule[] {
  const merged = new Map<string, ExamSchedule>();
  for (const schedule of preferred) merged.set(schedule.id, schedule);
  for (const schedule of preserved) {
    const existing = merged.get(schedule.id);
    merged.set(schedule.id, {
      ...existing,
      ...schedule,
      offlineReady: Boolean(schedule.offlineReady || existing?.offlineReady),
      packVersion: schedule.packVersion ?? existing?.packVersion,
      downloadedAt: schedule.downloadedAt ?? existing?.downloadedAt,
      serverNow: existing?.serverNow ?? schedule.serverNow,
    });
  }
  return Array.from(merged.values()).sort((a, b) =>
    String(b.examinationDateIso).localeCompare(String(a.examinationDateIso)),
  );
}
