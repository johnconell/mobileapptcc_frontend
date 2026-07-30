import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import {
  LobbyRepository,
  QuestionRepository,
  ScheduleRepository,
  SecurityRepository,
  StudentRepository,
} from '@/repositories';

export function useSchedules() {
  return useQuery({
    queryKey: QUERY_KEYS.schedules,
    queryFn: () => ScheduleRepository.getSchedules(),
  });
}

export function useSessions(scheduleId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sessions(scheduleId ?? ''),
    queryFn: () => ScheduleRepository.getSessionsBySchedule(scheduleId!),
    enabled: Boolean(scheduleId),
  });
}

export function useStudents(search?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.students, search ?? ''],
    queryFn: () =>
      search?.trim()
        ? StudentRepository.search(search)
        : StudentRepository.getAll(),
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

export function useLobby(sessionId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.lobby(sessionId),
    queryFn: () => LobbyRepository.getLobby(sessionId),
    refetchInterval: 2500,
    enabled: Boolean(sessionId),
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
