import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { QUERY_KEYS } from '@/shared/constants';
import { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';
import type { ExamSchedule } from '@/shared/types';

export function useSchedules(enabled = true) {
  const queryClient = useQueryClient();
  const [cloudRefreshState, setCloudRefreshState] = useState<
    'checking' | 'loading' | 'error' | 'done'
  >('checking');
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const query = useQuery({
    queryKey: QUERY_KEYS.schedules,
    queryFn: () => ScheduleRepository.getLocalSchedules(),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!enabled) {
      setCloudRefreshState('done');
      return undefined;
    }
    let active = true;
    let initialAttempt = true;
    const refresh = async () => {
      const network = await Network.getNetworkStateAsync().catch(() => null);
      if (!active) return;
      if (network?.isInternetReachable !== true) {
        if (initialAttempt) setCloudRefreshState('done');
        initialAttempt = false;
        return;
      }
      const localSchedules = queryClient.getQueryData<ExamSchedule[]>(QUERY_KEYS.schedules);
      if (initialAttempt) {
        setCloudRefreshState(localSchedules?.length ? 'done' : 'loading');
      }
      try {
        const schedules = await ScheduleRepository.refreshSchedulesFromCloud();
        if (active) {
          queryClient.setQueryData(QUERY_KEYS.schedules, schedules);
          if (initialAttempt) setCloudRefreshState('done');
        }
      } catch {
        if (active && initialAttempt && !localSchedules?.length) {
          setCloudRefreshState('error');
        }
      }
      initialAttempt = false;
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, queryClient, refreshAttempt]);

  const retryCloudRefresh = useCallback(
    () => setRefreshAttempt((attempt) => attempt + 1),
    [],
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    cloudRefreshState,
    retryCloudRefresh,
  };
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
