import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExamQuestions,
  buildStudentExamPaper,
  grade,
  toOriginalAnswerLetter,
} from '../../features/synchronization/services/offlineExamRepository';
import type { OfflinePack } from '../../features/synchronization/services/offlineStore';

function createMockPack(): OfflinePack {
  return {
    pack_version: 2,
    exported_at: new Date().toISOString(),
    schedules: [],
    applicants: [],
    registrations: [],
    question_banks: [
      {
        id: 1,
        title: '2026 Examination Questions',
        is_active: true,
        subjects: [
          {
            id: 101,
            name: 'Verbal Ability',
            is_active: true,
            questions: [
              {
                id: 1,
                stem: 'Question 1: What is the synonym of rapid?',
                options: { A: 'Slow', B: 'Fast', C: 'Heavy', D: 'Soft' },
                correct_answer: 'B',
                is_selected_for_exam: true,
                status: 'active',
              },
              {
                id: 2,
                stem: 'Question 2: What is the antonym of giant?',
                options: { A: 'Tiny', B: 'Huge', C: 'Colossal', D: 'Vast' },
                correct_answer: 'A',
                is_selected_for_exam: true,
                status: 'active',
              },
            ],
          },
          {
            id: 102,
            name: 'Numerical Ability',
            is_active: true,
            questions: [
              {
                id: 3,
                stem: 'Question 3: 15 + 27 = ?',
                options: { A: '42', B: '41', C: '43', D: '45' },
                correct_answer: 'A',
                is_selected_for_exam: true,
                status: 'active',
              },
              {
                id: 4,
                stem: 'Question 4: 8 * 9 = ?',
                options: { A: '71', B: '72', C: '73', D: '74' },
                correct_answer: 'B',
                is_selected_for_exam: true,
                status: 'active',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Examination Set Assignment & Deterministic Paper Generation', () => {
  const pack = createMockPack();

  it('buildExamQuestions returns canonical questions in pack order', () => {
    const qs = buildExamQuestions(pack);
    assert.equal(qs.length, 4);
    assert.deepEqual(
      qs.map((q) => q.id),
      ['1', '2', '3', '4'],
    );
    assert.equal(qs[0].choices.A, 'Slow');
    assert.equal(qs[0].choices.B, 'Fast');
  });

  it('Set 1 retains canonical question order and canonical choices', () => {
    const paper1 = buildStudentExamPaper(pack, 'Set 1');
    assert.equal(paper1.examSet, 'Set 1');
    assert.equal(paper1.questions.length, 4);
    assert.deepEqual(
      paper1.questions.map((q) => q.id),
      ['1', '2', '3', '4'],
    );
    assert.deepEqual(paper1.choiceMaps['1'], { A: 'A', B: 'B', C: 'C', D: 'D' });
    assert.equal(paper1.questions[0].choices.A, 'Slow');
    assert.equal(paper1.questions[0].choices.B, 'Fast');
    assert.equal(paper1.questions[0].correctAnswer, 'B');
  });

  it('Set 2, Set 3, Set 4 are deterministic and reproducible on reload', () => {
    const paper2a = buildStudentExamPaper(pack, 'Set 2');
    const paper2b = buildStudentExamPaper(pack, 'Set 2');
    assert.equal(paper2a.examSet, 'Set 2');
    assert.equal(paper2b.examSet, 'Set 2');

    // Exactly same question order on reload
    assert.deepEqual(
      paper2a.questions.map((q) => q.id),
      paper2b.questions.map((q) => q.id),
    );
    // Exactly same choice mapping on reload
    assert.deepEqual(paper2a.choiceMaps, paper2b.choiceMaps);
  });

  it('All sets contain the exact same questions and can be graded accurately', () => {
    for (const setName of ['Set 1', 'Set 2', 'Set 3', 'Set 4']) {
      const paper = buildStudentExamPaper(pack, setName);
      assert.equal(paper.questions.length, 4);

      // Verify all question IDs are present
      const ids = new Set(paper.questions.map((q) => q.id));
      assert.equal(ids.size, 4);
      assert.ok(ids.has('1') && ids.has('2') && ids.has('3') && ids.has('4'));

      // Simulate student choosing the correct answer on their specific paper
      const answers: Record<string, string | null> = {};
      for (const q of paper.questions) {
        // Map student display answer back to canonical pack answer
        const displayCorrect = q.correctAnswer;
        const canonicalLetter = toOriginalAnswerLetter(paper.choiceMaps, q.id, displayCorrect);
        answers[q.id] = canonicalLetter;
      }

      // Grade against canonical pack answers
      const result = grade(pack, answers);
      assert.equal(result.items_correct, 4);
      assert.equal(result.score, 100);
      assert.equal(result.result_status, 'passed');
    }
  });
});

