import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/shared/constants';
import { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';

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
    networkMode: 'always',
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
