import type { Question } from '@/shared/types';
import questionsData from './official100Questions.json';

export const OFFICIAL_100_QUESTIONS: Question[] = questionsData as unknown as Question[];
