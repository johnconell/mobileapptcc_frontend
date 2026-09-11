import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/shared/constants';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';

export function useLobby(sessionId?: string, roomId?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.lobby(sessionId, roomId),
    queryFn: () => {
      if (__DEV__) console.log("[LOBBY DEBUG] Polling Triggered for Session:", sessionId);
      return LobbyRepository.getLobby(sessionId, roomId);
    },
    refetchInterval: 4000, // Reduced frequency for large LAN groups
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    enabled: Boolean(sessionId) && enabled,
    retry: 3, // More retries for flaky LAN
    networkMode: 'always', // Essential for Offline LAN polling
  });
}
