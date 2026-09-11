import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/shared/constants';
import { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';

export function useQuestions(sessionId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.questions(sessionId),
    queryFn: () => QuestionRepository.getQuestions(sessionId!),
    enabled: Boolean(sessionId),
    networkMode: 'always',
  });
}
