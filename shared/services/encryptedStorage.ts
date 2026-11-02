import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { appStorage } from '@/shared/services/storage';

export const DEFAULT_KEY_STORAGE_NAME = 'tcc.offline.pack.aes.key';

export class StorageError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageKeyUnavailableError extends StorageError {
  constructor(message = 'Platform secure key is unavailable or could not be generated.', cause?: unknown) {
    super(message, 'KEY_UNAVAILABLE', cause);
    this.name = 'StorageKeyUnavailableError';
  }
}

export class StorageFileNotFoundError extends StorageError {
  constructor(filePath: string) {
    super(`Storage file not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.name = 'StorageFileNotFoundError';
  }
}

export class StorageCorruptionError extends StorageError {
  constructor(message = 'Storage file format is corrupted or invalid.', cause?: unknown) {
    super(message, 'CORRUPTED_DATA', cause);
    this.name = 'StorageCorruptionError';
  }
}

export class StorageDecryptionError extends StorageError {
  constructor(message = 'Failed to authenticate or decrypt storage file.', cause?: unknown) {
    super(message, 'DECRYPTION_FAILED', cause);
    this.name = 'StorageDecryptionError';
  }
}

export type EncryptedEnvelope = {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string; // base64 (12 bytes)
  ct: string; // base64 (ciphertext + 16 bytes auth tag)
  meta?: {
    createdAt?: string;
    type?: string;
  };
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getRandomBytes(length: number): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  try {
    const random = await Crypto.getRandomBytesAsync(length);
    return new Uint8Array(random);
  } catch (err) {
    throw new StorageKeyUnavailableError('Cannot obtain cryptographically secure random bytes', err);
  }
}

let testKeyOverride: Uint8Array | null = null;

export function setTestStorageKeyOverride(key: Uint8Array | null): void {
  testKeyOverride = key;
}

export async function getOrCreateStorageKey(keyName: string = DEFAULT_KEY_STORAGE_NAME): Promise<Uint8Array> {
  if (testKeyOverride) {
    return testKeyOverride;
  }
  try {
    const existing = await appStorage.getItem(keyName);
    if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
      return hexToBytes(existing);
    }
    const key = await getRandomBytes(32);
    await appStorage.setItem(keyName, bytesToHex(key));
    return key;
  } catch (err) {
    throw new StorageKeyUnavailableError(`Failed to access or generate platform secure key [${keyName}]`, err);
  }
}

export async function encryptJson(
  payload: unknown,
  customKey?: Uint8Array,
  meta?: { type?: string },
): Promise<string> {
  const key = customKey ?? (await getOrCreateStorageKey());
  if (!key || key.length !== 32) {
    throw new StorageKeyUnavailableError(`AES-256-GCM requires a 32-byte key, but received ${key?.length ?? 0} bytes.`);
  }
  const iv = await getRandomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(plaintext);
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertext),
    meta: {
      createdAt: new Date().toISOString(),
      ...(meta?.type ? { type: meta.type } : {}),
    },
  };
  return JSON.stringify(envelope);
}

export async function decryptJson<T>(raw: string, customKey?: Uint8Array): Promise<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new StorageCorruptionError('Stored record is not valid JSON.', err);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('v' in parsed) ||
    !('alg' in parsed) ||
    !('iv' in parsed) ||
    !('ct' in parsed)
  ) {
    // Legacy plaintext record — return in memory
    return parsed as T;
  }

  const envelope = parsed as EncryptedEnvelope;
  if (envelope.v !== 1 || envelope.alg !== 'AES-256-GCM') {
    return parsed as T;
  }

  const key = customKey ?? (await getOrCreateStorageKey());
  if (!key || key.length !== 32) {
    throw new StorageKeyUnavailableError(`AES-256-GCM requires a 32-byte key, but received ${key?.length ?? 0} bytes.`);
  }
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = base64ToBytes(envelope.iv);
    ct = base64ToBytes(envelope.ct);
  } catch (err) {
    throw new StorageCorruptionError('Corrupted base64 encoding in encryption envelope.', err);
  }

  try {
    const cipher = gcm(key, iv);
    const plaintextBytes = cipher.decrypt(ct);
    const decodedText = new TextDecoder().decode(plaintextBytes);
    return JSON.parse(decodedText) as T;
  } catch (err) {
    throw new StorageDecryptionError('Authentication tag verification failed or ciphertext is corrupted.', err);
  }
}

export function isEncryptedEnvelope(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed &&
      typeof parsed === 'object' &&
      parsed.v === 1 &&
      parsed.alg === 'AES-256-GCM' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ct === 'string'
    );
  } catch {
    return false;
  }
}

export async function writeEncryptedFile(
  filePath: string,
  webKey: string,
  data: unknown,
  options?: { meta?: { type?: string } },
): Promise<void> {
  const ciphertextJson = await encryptJson(data, undefined, options?.meta);

  // Self-verification in memory before touching disk
  await decryptJson(ciphertextJson);

  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    await appStorage.setItem(webKey, ciphertextJson);
    return;
  }

  // Atomic file write using temporary file
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.floor(Math.random() * 100000)}`;
  try {
    await FileSystem.writeAsStringAsync(tempPath, ciphertextJson);
    // Verify file written to disk
    const written = await FileSystem.readAsStringAsync(tempPath);
    await decryptJson(written);

    // Overwrite target file
    const targetInfo = await FileSystem.getInfoAsync(filePath);
    if (targetInfo.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: tempPath, to: filePath });
  } catch (err) {
    try {
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function readEncryptedFile<T>(
  filePath: string,
  webKey: string,
  options?: {
    legacyPlaintextPath?: string;
    legacyWebKey?: string;
    type?: string;
  },
): Promise<{ data: T; isMigrated: boolean }> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    const enc = await appStorage.getItem(webKey);
    if (enc) {
      const data = await decryptJson<T>(enc);
      // Clean up legacy web key if still lingering
      if (options?.legacyWebKey) {
        await appStorage.deleteItem(options.legacyWebKey).catch(() => undefined);
      }
      return { data, isMigrated: false };
    }

    if (options?.legacyWebKey) {
      const legacyRaw = await appStorage.getItem(options.legacyWebKey);
      if (legacyRaw) {
        let legacyData: T;
        try {
          legacyData = JSON.parse(legacyRaw) as T;
        } catch (err) {
          throw new StorageCorruptionError('Legacy plaintext web storage is corrupted.', err);
        }
        // Write to encrypted storage and verify before deleting legacy
        await writeEncryptedFile(filePath, webKey, legacyData, { meta: { type: options.type } });
        await appStorage.deleteItem(options.legacyWebKey).catch(() => undefined);
        return { data: legacyData, isMigrated: true };
      }
    }

    throw new StorageFileNotFoundError(webKey);
  }

  const encInfo = await FileSystem.getInfoAsync(filePath);
  if (encInfo.exists) {
    const raw = await FileSystem.readAsStringAsync(filePath);
    const data = await decryptJson<T>(raw);
    // If legacy file still exists, clean it up now that encrypted file is verified
    if (options?.legacyPlaintextPath) {
      try {
        const legacyInfo = await FileSystem.getInfoAsync(options.legacyPlaintextPath);
        if (legacyInfo.exists) {
          await FileSystem.deleteAsync(options.legacyPlaintextPath, { idempotent: true });
        }
      } catch {
        // ignore cleanup error
      }
    }
    return { data, isMigrated: false };
  }

  if (options?.legacyPlaintextPath) {
    const legacyInfo = await FileSystem.getInfoAsync(options.legacyPlaintextPath);
    if (legacyInfo.exists) {
      const legacyRaw = await FileSystem.readAsStringAsync(options.legacyPlaintextPath);
      let legacyData: T;
      try {
        legacyData = JSON.parse(legacyRaw) as T;
      } catch (err) {
        throw new StorageCorruptionError(`Legacy plaintext file is corrupted: ${options.legacyPlaintextPath}`, err);
      }
      // Migrate: write to encrypted storage with atomic verification
      await writeEncryptedFile(filePath, webKey, legacyData, { meta: { type: options.type } });
      // Only delete legacy plaintext after successful write & verification
      await FileSystem.deleteAsync(options.legacyPlaintextPath, { idempotent: true });
      return { data: legacyData, isMigrated: true };
    }
  }

  throw new StorageFileNotFoundError(filePath);
}

export async function deleteEncryptedFile(
  filePath: string,
  webKey: string,
  options?: { legacyPlaintextPath?: string; legacyWebKey?: string },
): Promise<void> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    await appStorage.deleteItem(webKey).catch(() => undefined);
    if (options?.legacyWebKey) {
      await appStorage.deleteItem(options.legacyWebKey).catch(() => undefined);
    }
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  } catch {
    // ignore
  }

  if (options?.legacyPlaintextPath) {
    try {
      const info = await FileSystem.getInfoAsync(options.legacyPlaintextPath);
      if (info.exists) {
        await FileSystem.deleteAsync(options.legacyPlaintextPath, { idempotent: true });
      }
    } catch {
      // ignore
    }
  }
}
