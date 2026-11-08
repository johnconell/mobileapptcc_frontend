export const PASSKEY_LENGTH = 8;

export function normalizePasskey(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatPasskey(value: unknown): string {
  const normalized = normalizePasskey(value).slice(0, PASSKEY_LENGTH);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

export function isValidPasskey(value: unknown): boolean {
  return /^[A-Z0-9]{8}$/.test(normalizePasskey(value));
}
