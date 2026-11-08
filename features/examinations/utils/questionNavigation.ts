import type { ExamAnswer } from '@/shared/types';

export type QuestionNavigatorFilter =
  | 'all'
  | 'answered'
  | 'not_sure'
  | 'unanswered'
  | 'review';

export function isQuestionAnswered(answer: ExamAnswer | undefined): boolean {
  return answer?.selectedAnswer !== null && answer?.selectedAnswer !== undefined;
}

export function questionMatchesFilter(
  filter: QuestionNavigatorFilter,
  answer: ExamAnswer | undefined,
  flagged: boolean,
): boolean {
  if (filter === 'answered') return isQuestionAnswered(answer);
  if (filter === 'not_sure') return flagged;
  if (filter === 'unanswered') return !isQuestionAnswered(answer);
  if (filter === 'review') return flagged || !isQuestionAnswered(answer);
  return true;
}

