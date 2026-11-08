type QueuedResultIdentity = {
  local_id: string;
  applicant_code: string;
  examination_schedule_id: number;
  answers: unknown;
  submitted_at?: string;
};

type SubmissionIdentity = {
  localId: string;
  applicantCode: string;
  scheduleId: number;
  answers: unknown;
};

export type ResultQueueMatch =
  | { kind: 'new' }
  | { kind: 'duplicate'; result: QueuedResultIdentity }
  | { kind: 'conflict'; result: QueuedResultIdentity };

function answerEntries(value: unknown): Array<[string, string | null]> {
  if (Array.isArray(value)) {
    return value
      .filter(
        (answer): answer is { exam_question_id: number | string; selected_answer?: unknown } =>
          answer !== null &&
          typeof answer === 'object' &&
          'exam_question_id' in answer,
      )
      .map((answer) => [
        String(answer.exam_question_id),
        answer.selected_answer == null
          ? null
          : String(answer.selected_answer).trim().toUpperCase(),
      ]);
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([questionId, answer]) => [
      questionId,
      answer == null ? null : String(answer).trim().toUpperCase(),
    ]);
  }

  return [];
}

function canonicalAnswers(value: unknown): string {
  return JSON.stringify(
    answerEntries(value).sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true }),
    ),
  );
}

function sameStudent(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

export function matchQueuedResult(
  results: readonly QueuedResultIdentity[],
  submission: SubmissionIdentity,
): ResultQueueMatch {
  const sameLocalId = results.find((result) => result.local_id === submission.localId);
  if (sameLocalId) {
    const sameIdentity =
      sameStudent(sameLocalId.applicant_code, submission.applicantCode) &&
      Number(sameLocalId.examination_schedule_id) === submission.scheduleId;

    return sameIdentity && canonicalAnswers(sameLocalId.answers) === canonicalAnswers(submission.answers)
      ? { kind: 'duplicate', result: sameLocalId }
      : { kind: 'conflict', result: sameLocalId };
  }

  const sameAttempt = results.find(
    (result) =>
      sameStudent(result.applicant_code, submission.applicantCode) &&
      Number(result.examination_schedule_id) === submission.scheduleId,
  );
  if (!sameAttempt) return { kind: 'new' };
  return canonicalAnswers(sameAttempt.answers) === canonicalAnswers(submission.answers)
    ? { kind: 'duplicate', result: sameAttempt }
    : { kind: 'conflict', result: sameAttempt };
}

export async function queueResultBeforeConfirm<T>(
  row: T,
  queue: (result: T) => Promise<void>,
  confirm: () => void,
): Promise<void> {
  await queue(row);
  confirm();
}
