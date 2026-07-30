import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import {
  LobbyRepository,
  QuestionRepository,
  ScheduleRepository,
  SecurityRepository,
  StudentRepository,
} from '@/repositories';

export function useSchedules(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.schedules,
    queryFn: () => ScheduleRepository.getSchedules(),
    enabled,
    retry: (count, error) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return count < 1;
    },
  });
}

export function useSessions(scheduleId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sessions(scheduleId ?? ''),
    queryFn: () => ScheduleRepository.getSessionsBySchedule(scheduleId!),
    enabled: Boolean(scheduleId),
  });
}

export function useRooms(sessionId?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.rooms(sessionId ?? ''),
    queryFn: () => ScheduleRepository.getRoomsBySession(sessionId!),
    enabled: Boolean(sessionId) && enabled,
    refetchInterval: 2000,
    retry: (count, error) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return count < 1;
    },
  });
}

export function useStudents(search?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.students, search ?? ''],
    queryFn: () =>
      search?.trim()
        ? StudentRepository.search(search)
        : StudentRepository.getAll(),
    refetchInterval: 2000,
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: QUERY_KEYS.programs,
    queryFn: () => StudentRepository.getPrograms(),
  });
}

export function useQuestions(sessionId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.questions(sessionId),
    queryFn: () => QuestionRepository.getQuestions(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useLobby(sessionId?: string, roomId?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.lobby(sessionId, roomId),
    queryFn: () => LobbyRepository.getLobby(sessionId, roomId),
    refetchInterval: 2500,
    enabled: Boolean(sessionId) && enabled,
    retry: 1,
  });
}

export function useViolations(sessionId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.violations(sessionId),
    queryFn: () => SecurityRepository.getViolations(sessionId),
    refetchInterval: 3000,
    enabled: Boolean(sessionId),
  });
}
