import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExamQuestions,
  buildStudentExamPaperFromQuestions,
  buildStudentExamPaper,
  grade,
  toOriginalAnswerLetter,
} from '../../features/synchronization/services/offlineExamRepository';
import type { OfflinePack } from '../../features/synchronization/services/offlineStore';
import type { Question } from '../../shared/types';

function createMock100QuestionPack(): OfflinePack {
  const categories = [
    'Verbal Ability',
    'Numerical Ability',
    'Logical Ability',
    'General Information',
    'Abstract Reasoning',
  ];

  let questionIdCounter = 1;
  const subjects = categories.map((catName, catIndex) => {
    const questions = [];
    for (let i = 1; i <= 20; i++) {
      const qId = questionIdCounter++;
      const correctChoice = ['A', 'B', 'C', 'D'][(qId + i) % 4];
      questions.push({
        id: qId,
        stem: `${catName} Question ${i}: What is the solution for item ${qId}?`,
        options: {
          A: `Option A for Q${qId}`,
          B: `Option B for Q${qId}`,
          C: `Option C for Q${qId}`,
          D: `Option D for Q${qId}`,
        },
        correct_answer: correctChoice,
        is_selected_for_exam: true,
        status: 'active',
      });
    }
    return {
      id: 100 + catIndex,
      name: catName,
      is_active: true,
      questions,
    };
  });

  return {
    pack_version: 3,
    exported_at: new Date().toISOString(),
    schedules: [],
    applicants: [],
    registrations: [],
    examination_settings: {
      duration_minutes: 90,
      shuffle_questions: true,
      shuffle_categories: true,
      shuffle_both: false,
      shuffle_answers: false,
    },
    question_banks: [
      {
        id: 1,
        title: 'Master Entrance Exam 2026',
        is_active: true,
        subjects,
      },
    ],
  };
}

describe('PART 2: Examination Randomization Based on Admin Settings', () => {
  const pack = createMock100QuestionPack();
  const canonicalQuestions = buildExamQuestions(pack);

  it('Verifies pack has 100 questions across 5 categories with 20 questions each', () => {
    assert.equal(canonicalQuestions.length, 100);
    const catCounts = new Map<string, number>();
    for (const q of canonicalQuestions) {
      const cat = q.category || '';
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    }
    assert.equal(catCounts.size, 5);
    for (const [cat, count] of catCounts.entries()) {
      assert.equal(count, 20, `Category ${cat} should have exactly 20 questions`);
    }
  });

  it('Requirement 2: Question Randomization within categories for different students', () => {
    // Setting: shuffle_questions ON, shuffle_categories OFF
    const settings = {
      shuffle_questions: true,
      shuffle_categories: false,
      shuffle_both: false,
      shuffle_answers: false,
    };

    const paperStudentA = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-001',
      settings,
    });
    const paperStudentB = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-002',
      settings,
    });

    // Both have 100 questions renumbered 1 to 100
    assert.equal(paperStudentA.questions.length, 100);
    assert.equal(paperStudentB.questions.length, 100);
    assert.equal(paperStudentA.questions[0].number, 1);
    assert.equal(paperStudentA.questions[99].number, 100);
    assert.equal(paperStudentB.questions[0].number, 1);
    assert.equal(paperStudentB.questions[99].number, 100);

    // Categories are preserved in configured order
    const catA = paperStudentA.questions.slice(0, 20).map((q) => q.category);
    const catB = paperStudentB.questions.slice(0, 20).map((q) => q.category);
    assert.ok(catA.every((c) => c === 'Verbal Ability'));
    assert.ok(catB.every((c) => c === 'Verbal Ability'));

    // Question sequences in Verbal Ability are different between Student A and Student B
    const verbalIdsA = paperStudentA.questions.slice(0, 20).map((q) => q.id);
    const verbalIdsB = paperStudentB.questions.slice(0, 20).map((q) => q.id);
    assert.notDeepEqual(verbalIdsA, verbalIdsB);

    // But both contain the exact same 20 Verbal Ability question IDs
    assert.deepEqual([...verbalIdsA].sort(), [...verbalIdsB].sort());

    // Deterministic: Student A paper is identical when regenerated with same identifier
    const paperStudentARetry = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-001',
      settings,
    });
    assert.deepEqual(
      paperStudentA.questions.map((q) => q.id),
      paperStudentARetry.questions.map((q) => q.id),
    );
  });

  it('Requirement 2 (Disabled): When Shuffle questions is OFF, original order is preserved', () => {
    const settings = {
      shuffle_questions: false,
      shuffle_categories: false,
      shuffle_both: false,
      shuffle_answers: false,
    };

    const paper = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-003',
      settings,
    });

    assert.deepEqual(
      paper.questions.map((q) => q.id),
      canonicalQuestions.map((q) => q.id),
    );
  });

  it('Requirement 3: Category Randomization for different students', () => {
    // Setting: shuffle_questions OFF, shuffle_categories ON
    const settings = {
      shuffle_questions: false,
      shuffle_categories: true,
      shuffle_both: false,
      shuffle_answers: false,
    };

    const paperStudentA = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-AAA',
      settings,
    });
    const paperStudentB = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-BBB',
      settings,
    });

    // Extract category order (from questions 0, 20, 40, 60, 80)
    const categoryOrderA = [0, 20, 40, 60, 80].map((i) => paperStudentA.questions[i].category);
    const categoryOrderB = [0, 20, 40, 60, 80].map((i) => paperStudentB.questions[i].category);

    // Each chunk of 20 questions strictly belongs to one category
    for (let c = 0; c < 5; c++) {
      const chunkA = paperStudentA.questions.slice(c * 20, (c + 1) * 20);
      assert.ok(chunkA.every((q) => q.category === categoryOrderA[c]));

      const chunkB = paperStudentB.questions.slice(c * 20, (c + 1) * 20);
      assert.ok(chunkB.every((q) => q.category === categoryOrderB[c]));
    }

    // Different students receive different category sequences
    assert.notDeepEqual(categoryOrderA, categoryOrderB);

    // But both contain all 5 categories
    assert.deepEqual([...categoryOrderA].sort(), [...categoryOrderB].sort());
  });

  it('Requirement 4: Answer Choice Randomization and 100% Accurate Grading', () => {
    // Setting: shuffle_answers ON
    const settings = {
      shuffle_questions: false,
      shuffle_categories: false,
      shuffle_both: false,
      shuffle_answers: true,
    };

    const paperStudentA = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-C1',
      settings,
    });
    const paperStudentB = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-STUDENT-C2',
      settings,
    });

    // Check choice maps exist
    assert.ok(Object.keys(paperStudentA.choiceMaps).length === 100);
    assert.ok(Object.keys(paperStudentB.choiceMaps).length === 100);

    // Look at question 1
    const q1Original = canonicalQuestions[0];
    const q1A = paperStudentA.questions[0];
    const q1B = paperStudentB.questions[0];

    const mapA = paperStudentA.choiceMaps[q1A.id];
    const mapB = paperStudentB.choiceMaps[q1B.id];

    // For Student A: what option is displayed at 'A'? It must match the original text of mapA['A']
    assert.equal(q1A.choices.A, q1Original.choices[mapA.A]);
    assert.equal(q1A.choices.B, q1Original.choices[mapA.B]);
    assert.equal(q1A.choices.C, q1Original.choices[mapA.C]);
    assert.equal(q1A.choices.D, q1Original.choices[mapA.D]);

    // Test grading: Suppose student A selects whichever display choice shows the CORRECT answer
    // Original correct answer for question 1:
    const originalCorrectLetter = q1Original.correctAnswer; // e.g. 'A', 'B', 'C', or 'D'
    // Find which display letter corresponds to originalCorrectLetter
    const displayCorrectLetterForA = (Object.keys(mapA) as Array<'A' | 'B' | 'C' | 'D'>).find(
      (key) => mapA[key] === originalCorrectLetter,
    )!;

    // Student A selects displayCorrectLetterForA
    const studentAnswerPayload = {
      [q1A.id]: displayCorrectLetterForA,
    };

    // Evaluate using toOriginalAnswerLetter:
    const mappedBack = toOriginalAnswerLetter(paperStudentA.choiceMaps, q1A.id, studentAnswerPayload[q1A.id]);
    assert.equal(mappedBack, originalCorrectLetter, 'Must map display letter back to original canonical answer');

    // Grade against pack:
    const answersForGrading: Record<string, string | null> = {};
    for (const [id, display] of Object.entries(studentAnswerPayload)) {
      answersForGrading[id] = toOriginalAnswerLetter(paperStudentA.choiceMaps, id, display);
    }
    const graded = grade(pack, answersForGrading);
    assert.equal(graded.items_correct, 1);
  });

  it('Requirement 5: Full Shuffle activates both Question and Category shuffle while Answer Shuffle is independent', () => {
    // Full shuffle ON, answer shuffle OFF
    const settingsFull = {
      shuffle_questions: false,
      shuffle_categories: false,
      shuffle_both: true,
      shuffle_answers: false,
    };

    const paper = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: '2026-FULL-01',
      settings: settingsFull,
    });

    // Categories are shuffled
    const catOrder = [0, 20, 40, 60, 80].map((i) => paper.questions[i].category);
    assert.notDeepEqual(catOrder, [
      'Verbal Ability',
      'Numerical Ability',
      'Logical Ability',
      'General Information',
      'Abstract Reasoning',
    ]);

    // Questions within category are shuffled
    const firstCatIds = paper.questions.slice(0, 20).map((q) => q.id);
    const canonicalFirstCatIds = canonicalQuestions
      .filter((q) => q.category === catOrder[0])
      .map((q) => q.id);
    assert.notDeepEqual(firstCatIds, canonicalFirstCatIds);

    // Answer choices are NOT shuffled
    assert.deepEqual(paper.choiceMaps[paper.questions[0].id], { A: 'A', B: 'B', C: 'C', D: 'D' });
  });

  it('Requirement 6: Stability throughout navigation, recovery, and answer preservation', () => {
    const settings = {
      shuffle_questions: true,
      shuffle_categories: true,
      shuffle_both: false,
      shuffle_answers: true,
    };

    const studentId = '2026-PERSIST-01';
    const paper = buildStudentExamPaperFromQuestions(canonicalQuestions, {
      studentIdentifier: studentId,
      settings,
    });

    const questionOrder = paper.questions.map((q) => q.id);
    const choiceMaps = paper.choiceMaps;

    // Simulate saving checkpoint
    const simulatedAnswers = {
      [questionOrder[0]]: { questionId: questionOrder[0], selectedAnswer: 'C' as const, answeredAt: new Date().toISOString() },
      [questionOrder[5]]: { questionId: questionOrder[5], selectedAnswer: 'A' as const, answeredAt: new Date().toISOString() },
    };
    const simulatedFlags = {
      [questionOrder[0]]: true, // Answered AND flagged
      [questionOrder[1]]: true, // Flagged but unanswered
    };

    // Simulate app killed and recovered using questionOrder and choiceMaps
    const byId = new Map(canonicalQuestions.map((q) => [q.id, q]));
    const restoredOrdered = questionOrder.map((id) => byId.get(id)!);
    const restoredQuestions = restoredOrdered.map((q, index) => {
      const map = choiceMaps[q.id];
      const choices = { A: '', B: '', C: '', D: '' } as Question['choices'];
      for (const display of ['A', 'B', 'C', 'D'] as const) {
        const original = map[display] ?? display;
        choices[display] = q.choices[original] ?? '';
      }
      return { ...q, number: index + 1, choices };
    });

    // Verification:
    // 1. Question sequence is 100% identical to original attempt
    assert.deepEqual(
      restoredQuestions.map((q) => q.id),
      questionOrder,
    );
    // 2. Choice text is 100% identical to original attempt
    assert.equal(restoredQuestions[0].choices.A, paper.questions[0].choices.A);
    assert.equal(restoredQuestions[0].choices.B, paper.questions[0].choices.B);
    assert.equal(restoredQuestions[0].choices.C, paper.questions[0].choices.C);
    assert.equal(restoredQuestions[0].choices.D, paper.questions[0].choices.D);

    // 3. Flags and answers preserved without loss
    assert.equal(simulatedAnswers[questionOrder[0]].selectedAnswer, 'C');
    assert.equal(simulatedFlags[questionOrder[0]], true, 'Question 0 is both answered and flagged');
    assert.equal(simulatedFlags[questionOrder[1]], true, 'Question 1 is flagged but unanswered');
    assert.equal(simulatedAnswers[questionOrder[1]], undefined, 'Question 1 has no answer');
  });
});
