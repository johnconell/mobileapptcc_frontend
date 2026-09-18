/**
 * Convert raw Error / API / network text into a short message safe to show in UI.
 * Logs the original detail for debugging; never exposes stack traces, SQL, or host internals.
 */
const TECHNICAL_PATTERNS = [
  /SQLSTATE/i,
  /SQL:/i,
  /PDOException/i,
  /Illuminate\\/i,
  /Stack trace/i,
  /at Object\./i,
  /TypeError:/i,
  /ReferenceError:/i,
  /SyntaxError:/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /Network request failed/i,
  /Failed to fetch/i,
  /AbortError/i,
  /timeout/i,
  /status code\s*\d+/i,
  /Request rejected/i,
  /Unexpected token/i,
  /JSON\.parse/i,
  /http:\/\//i,
  /https:\/\//i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /\/api\/v1/i,
  /Bearer /i,
  /Integrity Failure/i,
  /CRITICAL/i,
  /Exception/i,
  /\{.*".*":.*\}/s,
];

const FRIENDLY_FALLBACK = 'Something went wrong. Please try again.';

function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) ?? '';
}

function looksTechnical(text: string): boolean {
  if (!text || text.length > 280) return true;
  return TECHNICAL_PATTERNS.some((re) => re.test(text));
}

/** Prefer API `message` when it is already human-readable. */
export function userFacingError(
  err: unknown,
  fallback: string = FRIENDLY_FALLBACK,
): string {
  let raw = '';

  if (typeof err === 'string') {
    raw = err;
  } else if (err instanceof Error) {
    raw = err.message;
  } else if (err && typeof err === 'object') {
    const anyErr = err as {
      message?: string;
      response?: { data?: { message?: string; error?: string } };
    };
    raw =
      anyErr.response?.data?.message ||
      anyErr.response?.data?.error ||
      anyErr.message ||
      '';
  }

  if (__DEV__ && raw) {
    console.warn('[userFacingError]', raw);
  }

  const cleaned = firstLine(String(raw || '').replace(/\s+/g, ' ').trim());
  if (!cleaned) return fallback;
  if (looksTechnical(cleaned)) return fallback;

  // Keep known product messages (Examination Already Completed, Wi‑Fi, etc.)
  return cleaned;
}

export function userFacingAlertMessage(
  err: unknown,
  fallback: string = FRIENDLY_FALLBACK,
): string {
  return userFacingError(err, fallback);
}
