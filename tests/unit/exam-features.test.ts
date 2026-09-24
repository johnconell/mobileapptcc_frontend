import test from 'node:test';
import assert from 'node:assert/strict';
import { useExamStore } from '../../features/examinations/stores/examStore';
import { buildCategoryProgress } from '../../features/examinations/utils/categoryProgress';
import type { Question } from '../../shared/types';

test('exam features: navigation mode, flags, category progress, and type-to-confirm', async (t) => {
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
