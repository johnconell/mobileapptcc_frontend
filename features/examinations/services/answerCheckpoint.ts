export type AnswerValue = string | null;

export type VersionedAnswerCheckpoint = {
  answers: Record<string, AnswerValue>;
  revision?: number;
  savedAt?: string;
};

/**
 * Checkpoints are full snapshots, so an older LAN request must never replace
 * a newer one when packets complete out of order. Legacy clients without a
 * revision remain accepted only before a versioned checkpoint has been
 * received; once versioning starts, an unversioned stale client cannot clobber
 * the newer snapshot.
 */
export function shouldApplyAnswerCheckpoint(
  currentRevision: number,
  incomingRevision?: number,
): boolean {
  if (typeof incomingRevision !== 'number' || !Number.isSafeInteger(incomingRevision)) {
    return currentRevision === 0;
  }
  return incomingRevision > currentRevision;
}

export function normalizeAnswerCheckpoint(
  checkpoint: VersionedAnswerCheckpoint,
): VersionedAnswerCheckpoint {
  const answers: Record<string, AnswerValue> = {};
  for (const [questionId, value] of Object.entries(checkpoint.answers ?? {})) {
    answers[String(questionId)] = value == null ? null : String(value).toUpperCase();
  }
  return {
    answers,
    revision: Number.isSafeInteger(checkpoint.revision) ? checkpoint.revision : undefined,
    savedAt: checkpoint.savedAt,
  };
}
