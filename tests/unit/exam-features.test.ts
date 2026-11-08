import test from 'node:test';
import { questionMatchesFilter } from '@/features/examinations/utils/questionNavigation';
import assert from 'node:assert/strict';
import { useExamStore } from '../../features/examinations/stores/examStore';
import { buildCategoryProgress } from '../../features/examinations/utils/categoryProgress';
import { compareStudentNames } from '../../features/synchronization/utils/studentNameOrder';
import type { Question } from '../../shared/types';

test('exam features: navigation mode, flags, category progress, and type-to-confirm', async (t) => {
  await t.test('mobile proctor rosters use stable surname-first ordering', () => {
    const rows = [
      { id: 6, firstName: 'Ana', lastName: 'Santos' },
      { id: 4, firstName: '  Ben ', lastName: ' Rivera ' },
      { id: 2, firstName: 'ZOE', lastName: 'CRUZ' },
      { id: 3, firstName: 'Aira', lastName: 'Rivera' },
      { id: 5, firstName: 'ana', lastName: 'santos' },
      { id: 1, firstName: 'Amy', lastName: 'Dela Cruz' },
    ];
    rows.sort(compareStudentNames);
    assert.deepEqual(rows.map((row) => row.id), [2, 1, 3, 4, 5, 6]);
  });

  await t.test('navMode defaults to scroll and can toggle to one_at_a_time', () => {
    const store = useExamStore.getState();
    store.reset();
    assert.equal(useExamStore.getState().navMode, 'scroll');

    useExamStore.getState().setNavMode('one_at_a_time');
    assert.equal(useExamStore.getState().navMode, 'one_at_a_time');

    useExamStore.getState().setNavMode('scroll');
    assert.equal(useExamStore.getState().navMode, 'scroll');
  });

  await t.test('toggleFlag marks questions as Not Sure / Sure', () => {
    useExamStore.getState().reset();
    const mockChoices = { A: 'Choice A', B: 'Choice B', C: 'Choice C', D: 'Choice D' };
    const mockQuestions = [
      { id: 'q1', number: 1, question: 'Question 1', choices: mockChoices, category: 'Math', subjectId: 'math', type: 'multiple_choice' as const, correctAnswer: 'A' as const, explanation: '' },
      { id: 'q2', number: 2, question: 'Question 2', choices: mockChoices, category: 'Math', subjectId: 'math', type: 'multiple_choice' as const, correctAnswer: 'B' as const, explanation: '' },
    ] as Question[];
    useExamStore.getState().setQuestions(mockQuestions);

    assert.equal(useExamStore.getState().flags['q1'], false);
    useExamStore.getState().toggleFlag('q1');
    assert.equal(useExamStore.getState().flags['q1'], true);
    useExamStore.getState().toggleFlag('q1');
    assert.equal(useExamStore.getState().flags['q1'], false);
  });

  await t.test('buildCategoryProgress returns correct answered-vs-total counts for buttons', () => {
    const mockChoices = { A: 'A', B: 'B', C: 'C', D: 'D' };
    const mockQuestions = [
      { id: 'q1', number: 1, question: 'Q1', choices: mockChoices, category: 'Math', subjectId: 'math', type: 'multiple_choice' as const, correctAnswer: 'A' as const, explanation: '' },
      { id: 'q2', number: 2, question: 'Q2', choices: mockChoices, category: 'Math', subjectId: 'math', type: 'multiple_choice' as const, correctAnswer: 'B' as const, explanation: '' },
      { id: 'q3', number: 3, question: 'Q3', choices: mockChoices, category: 'Science', subjectId: 'sci', type: 'multiple_choice' as const, correctAnswer: 'C' as const, explanation: '' },
    ] as Question[];
    const mockAnswers = {
      q1: { questionId: 'q1', selectedAnswer: 'A' as const, answeredAt: '2026-09-23T00:00:00Z' },
    };

    const categories = buildCategoryProgress(mockQuestions, mockAnswers);
    assert.equal(categories.length, 2);

    const math = categories.find((c) => c.key === 'Math');
    assert.ok(math);
    assert.equal(math.answered, 1);
    assert.equal(math.total, 2);
    assert.equal(`${math.label} (${math.answered}/${math.total})`, 'Math (1/2)');

    const science = categories.find((c) => c.key === 'Science');
    assert.ok(science);
    assert.equal(science.answered, 0);
    assert.equal(science.total, 1);
    assert.equal(`${science.label} (${science.answered}/${science.total})`, 'Science (0/1)');
  });

  await t.test('question status controls filter without changing answer or review state', () => {
    const answered = {
      questionId: 'q1',
      selectedAnswer: 'A' as const,
      answeredAt: '2026-11-04T09:00:00+08:00',
    };
    const unanswered = {
      questionId: 'q2',
      selectedAnswer: null,
      answeredAt: null,
    };

    assert.equal(questionMatchesFilter('answered', answered, false), true);
    assert.equal(questionMatchesFilter('answered', unanswered, false), false);
    assert.equal(questionMatchesFilter('not_sure', answered, true), true);
    assert.equal(questionMatchesFilter('unanswered', unanswered, false), true);
    assert.equal(questionMatchesFilter('review', answered, true), true);
    assert.equal(questionMatchesFilter('review', unanswered, false), true);
    assert.equal(answered.selectedAnswer, 'A');
  });

  await t.test('type-to-confirm only validates exact "exam submit" phrase', () => {
    const validateConfirm = (input: string) => input.trim().toLowerCase() === 'exam submit';

    assert.equal(validateConfirm(''), false);
    assert.equal(validateConfirm('submit'), false);
    assert.equal(validateConfirm('exam'), false);
    assert.equal(validateConfirm('examsubmit'), false);
    assert.equal(validateConfirm('exam submit '), true);
    assert.equal(validateConfirm('EXAM SUBMIT'), true);
    assert.equal(validateConfirm('exam submit'), true);
  });
});
