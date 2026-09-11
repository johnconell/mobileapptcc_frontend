import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/shared/constants';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';

export function useViolations(sessionId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.violations(sessionId),
    queryFn: () => SecurityRepository.getViolations(sessionId),
    refetchInterval: 3000,
    enabled: Boolean(sessionId),
  });
}
