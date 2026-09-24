import type { ExamAnswer, Question } from '@/shared/types';

export type CategoryProgress = {
  key: string;
  label: string;
  total: number;
  answered: number;
  firstIndex: number;
};

export function buildCategoryProgress(
  questions: Question[],
  answers: Record<string, ExamAnswer>,
): CategoryProgress[] {
  const order: string[] = [];
  const map = new Map<string, CategoryProgress>();

  questions.forEach((question, index) => {
    const key = (question.category || question.subjectId || 'General').trim() || 'General';
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        label: key,
        total: 0,
        answered: 0,
        firstIndex: index,
      };
      map.set(key, entry);
      order.push(key);
    }
    entry.total += 1;
    if (answers[question.id]?.selectedAnswer) {
      entry.answered += 1;
    }
  });

  return order.map((key) => map.get(key)!);
}

