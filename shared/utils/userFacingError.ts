type ErrorDetails = {
  message?: string;
  status?: number;
  statusCode?: number;
  name?: string;
  response?: {
    status?: number;
    data?: { message?: string; error?: string };
  };
};

const TECHNICAL_PATTERNS = [
  /SQLSTATE/i,
  /SQL:/i,
  /PDOException/i,
  /Illuminate\\/i,
  /Stack trace/i,
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
  /https?:\/\//i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /\/api\/v1/i,
  /Integrity Failure/i,
  /CRITICAL/i,
  /Exception/i,
  /\{.*".*":.*\}/s,
];

const FRIENDLY_FALLBACK = 'Unable to complete this request. Please try again.';

function isTechnical(text: string): boolean {
  return text.length > 280 || TECHNICAL_PATTERNS.some((pattern) => pattern.test(text));
}

function errorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return error as ErrorDetails;
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return error && typeof error === 'object' ? (error as ErrorDetails) : {};
}

function classifyMessage(text: string, status?: number): string | null {
  const message = text.toLowerCase();

  if (
    status === 401 &&
    /login|sign.?in|credential|password|unauthori[sz]ed/.test(message)
  ) {
    return 'Incorrect email or password. Please try again.';
  }
  if (/session expired|token expired/.test(message)) {
    return 'Your session has expired. Please log in again.';
  }
  if (/invalid.{0,20}(passkey|exam(?:ination)? key)|passkey.{0,20}invalid/.test(message)) {
    return 'Invalid passkey. Please check and try again.';
  }
  if (/wrong room|different room|room assignment/.test(message)) {
    return 'You are assigned to a different examination room.';
  }
  if (/not scheduled|incorrect schedule|wrong schedule/.test(message)) {
    return 'Your examination is not scheduled for this session.';
  }
  if (/qr.{0,20}(expired|no longer valid)|expired.{0,20}qr/.test(message)) {
    return 'This QR code is no longer valid. Request a new code from your proctor.';
  }
  if (/room.{0,20}(already assigned|assigned to another)/.test(message)) {
    return 'This room is assigned to another proctor.';
  }
  if (/room.{0,20}(unavailable|not available)/.test(message)) {
    return 'This examination room is not currently available.';
  }
  if (/pack.{0,30}(missing|unavailable|not downloaded)/.test(message)) {
    return 'Examination data is unavailable. Download the examination pack before opening the room.';
  }
  if (/storage|secure.?store|file.?system|decrypt/i.test(message)) {
    return 'Unable to save your data. Please try again.';
  }
  if (/sync|synchroni[sz]/i.test(message)) {
    return 'Results are saved locally but could not be synchronized. Retry when internet is available.';
  }
  if (
    /proctor.{0,50}(connect|reach|network|wifi|wi-fi|unreachable)|(?:connect|reach).{0,50}proctor/i.test(
      message,
    )
  ) {
    return "Cannot connect to the proctor's device. Check your local network connection.";
  }
  if (
    /network request failed|failed to fetch|econnrefused|enotfound|etimedout|aborterror|timed? out/i.test(
      message,
    )
  ) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  if (status === 401) {
    return 'Your session has expired. Please log in again.';
  }
  return null;
}

/** Convert raw failures to concise UI text without logging credentials or payloads. */
export function userFacingError(
  error: unknown,
  fallback: string = FRIENDLY_FALLBACK,
): string {
  const details = errorDetails(error);
  const raw =
    details.response?.data?.message ||
    details.response?.data?.error ||
    details.message ||
    '';
  const status = details.status ?? details.statusCode ?? details.response?.status;
  const cleaned = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  const classified = classifyMessage(cleaned, status);

  if (__DEV__ && (raw || status !== undefined)) {
    console.warn('[userFacingError] Request failure', {
      errorName: details.name || 'Error',
      status,
      category: classified ? 'known' : isTechnical(cleaned) ? 'technical' : 'request',
    });
  }

  if (classified) return classified;
  if (!cleaned || isTechnical(cleaned)) return fallback;
  return cleaned.replace(/\s+/g, ' ');
}

export function userFacingAlertMessage(
  error: unknown,
  fallback: string = FRIENDLY_FALLBACK,
): string {
  return userFacingError(error, fallback);
}
