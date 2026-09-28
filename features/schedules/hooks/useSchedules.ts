import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as Network from 'expo-network';
import { QUERY_KEYS } from '@/shared/constants';
import { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';

export function useSchedules(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEYS.schedules,
    queryFn: () => ScheduleRepository.getLocalSchedules(),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      const network = await Network.getNetworkStateAsync().catch(() => null);
      if (!active || network?.isInternetReachable !== true) return;
      try {
        const schedules = await ScheduleRepository.refreshSchedulesFromCloud();
        if (active) queryClient.setQueryData(QUERY_KEYS.schedules, schedules);
      } catch {
        // Keep the local list; a failed refresh must never replace it.
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, queryClient]);

  return query;
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
