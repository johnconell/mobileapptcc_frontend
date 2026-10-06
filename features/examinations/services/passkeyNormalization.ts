const INVISIBLE_PASSKEY_CHARACTERS =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/gu;

/** Normalize the printable 8-character examination key before validation or hashing. */
export function normalizeExamPasskey(value: unknown): string {
  return String(value ?? '')
    .replace(INVISIBLE_PASSKEY_CHARACTERS, '')
    .trim()
    .toUpperCase();
}

/** Do not write an examination key or its digest to developer logs. */
export function maskedExamPasskey(value: unknown): string {
  const normalized = normalizeExamPasskey(value);
  return normalized ? `[REDACTED ${normalized.length} chars]` : '[EMPTY]';
}
