export const CONFIRM_PHRASE = 'exam submit';

export const normalizePhrase = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export const isConfirmPhrase = (value: string) =>
  normalizePhrase(value) === CONFIRM_PHRASE;

export type SubmitReason = 'manual' | 'timeout' | 'proctor_ended';

type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'PHRASE_REQUIRED' | 'ALREADY_SUBMITTING' };

type SubmitControllerOptions = {
  finalizeSubmission: (reason: SubmitReason) => Promise<void>;
  onFailure?: (error: unknown) => void;
};

/** The only public entry point for starting a submission. */
export function createSubmitController({
  finalizeSubmission,
  onFailure,
}: SubmitControllerOptions) {
  let state: 'idle' | 'submitting' = 'idle';

  const requestSubmit = (
    reason: SubmitReason,
    typedPhrase?: string,
  ): SubmitResult => {
    if (reason === 'manual' && !isConfirmPhrase(typedPhrase ?? '')) {
      return { ok: false, error: 'PHRASE_REQUIRED' };
    }
    if (state !== 'idle') {
      return { ok: false, error: 'ALREADY_SUBMITTING' };
    }

    state = 'submitting';
    void finalizeSubmission(reason).catch((error) => {
      state = 'idle';
      onFailure?.(error);
    });
    return { ok: true };
  };

  return {
    requestSubmit,
    getState: () => state,
  };
}
