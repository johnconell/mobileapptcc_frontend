import ExamScreen from '@/app/(student)/exam';

export interface OptionItem {
  key: string;
  text: string;
}

export interface QuestionItem {
  id: number;
  number: number;
  category: string;
  questionText: string;
  options: OptionItem[];
}

export interface ExamScreenProps {
  initialTheme?: 'dark' | 'light';
  subjectTitle?: string;
  examTitle?: string;
  categoryName?: string;
  questions?: QuestionItem[];
  initialRemainingSeconds?: number;
  initialAnswers?: Record<number, string>;
  onSubmit?: (answers: Record<number, string>) => void;
}

export default ExamScreen;
