/**
 * Violation tracking is disabled in favor of mandatory screen pinning.
 * Stubs are retained to maintain backward compatibility across existing callsites.
 */
export function clampViolationLimit(_value?: unknown): number {
  return 0;
}

export async function persistViolationLimit(_value?: unknown): Promise<void> {
  // No-op: violation tracking disabled
}

export async function resolveViolationLimit(): Promise<number> {
  return 0;
}
