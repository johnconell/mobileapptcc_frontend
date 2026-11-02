import bcrypt from 'bcryptjs';
import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import {
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  StorageFileNotFoundError,
} from '@/shared/services/encryptedStorage';

export type CachedProctorAccount = {
  id: number | string;
  name: string;
  email: string;
  password_hash: string;
  status?: string | null;
};

const AUTH_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-proctor-auth-cache.enc`;
const WEB_AUTH_ENC_KEY = 'tcc.proctor.auth.cache.enc';
const AUTH_LEGACY_FILE = `${FileSystem.documentDirectory ?? ''}metcc-proctor-auth-cache.json`;
const WEB_AUTH_LEGACY_KEY = STORAGE_KEYS.proctorAuthCache;

async function writeAuth(rows: CachedProctorAccount[]): Promise<void> {
  await writeEncryptedFile(AUTH_ENC_FILE, WEB_AUTH_ENC_KEY, rows, {
    meta: { type: 'proctor_auth' },
  });
}

async function readAuth(): Promise<CachedProctorAccount[]> {
  try {
    const res = await readEncryptedFile<CachedProctorAccount[]>(
      AUTH_ENC_FILE,
      WEB_AUTH_ENC_KEY,
      {
        legacyPlaintextPath: AUTH_LEGACY_FILE,
        legacyWebKey: WEB_AUTH_LEGACY_KEY,
        type: 'proctor_auth',
      },
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    if (err instanceof StorageFileNotFoundError) {
      return [];
    }
    // Never silently return empty on decryption or corruption failure
    console.error(
      '[ProctorAuthCache] Failed to decrypt proctor credentials cache:',
      err instanceof Error ? err.name : 'StorageError',
    );
    throw err;
  }
}

/**
 * Local cache of proctor accounts (bcrypt hashes) for offline login.
 *
 * Security Architecture & Offline Limitations:
 * - Records are stored encrypted at rest with AES-256-GCM using device-bound keys
 *   held in platform secure storage (iOS Keychain / Android EncryptedSharedPreferences).
 * - Hashes are only cached for proctors explicitly assigned to the exported schedule/rooms.
 * - Limitation: Offline authentication verifies credentials against the snapshot captured at download.
 *   Immediate cloud account revocations, suspensions, or password changes cannot take effect on an offline
 *   device until the device synchronizes with the central server.
 */
export const ProctorAuthCache = {
  async saveFromPackProctors(proctors: unknown): Promise<number> {
    if (!Array.isArray(proctors)) return 0;
    const rows: CachedProctorAccount[] = [];
    for (const raw of proctors) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const email = String(row.email ?? '').trim().toLowerCase();
      const hash = String(row.password_hash ?? '');
      if (!email || !hash.startsWith('$2')) continue;
      rows.push({
        id: (row.id as number | string) ?? email,
        name: String(row.name ?? email),
        email,
        password_hash: hash,
        status: row.status != null ? String(row.status) : null,
      });
    }
    await writeAuth(rows);
    await appStorage.setItem(STORAGE_KEYS.proctorAuthCacheAt, new Date().toISOString());
    // Clear legacy unencrypted keys
    await appStorage.deleteItem(STORAGE_KEYS.proctorAuthCache).catch(() => undefined);
    return rows.length;
  },

  async list(): Promise<CachedProctorAccount[]> {
    return readAuth();
  },

  async hasAccounts(): Promise<boolean> {
    const list = await this.list();
    return list.length > 0;
  },

  async verify(emailOrUsername: string, password: string): Promise<CachedProctorAccount | null> {
    const needle = emailOrUsername.trim().toLowerCase();
    if (!needle || !password) return null;
    const accounts = await this.list();
    const match = accounts.find(
      (a) =>
        a.email === needle ||
        a.email.split('@')[0] === needle ||
        String(a.name).toLowerCase() === needle,
    );
    if (!match) return null;
    if (match.status && /inactive|disabled|suspended/i.test(match.status)) {
      return null;
    }
    const hash = match.password_hash.replace(/^\$2y\$/, '$2a$');
    const ok = await bcrypt.compare(password, hash);
    return ok ? match : null;
  },

  async updatePassword(emailOrUsername: string, newPassword: string): Promise<boolean> {
    const needle = emailOrUsername.trim().toLowerCase();
    if (!needle || !newPassword) return false;
    const accounts = await this.list();
    const idx = accounts.findIndex(
      (a) =>
        a.email === needle ||
        a.email.split('@')[0] === needle ||
        String(a.name).toLowerCase() === needle,
    );
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    if (idx >= 0) {
      accounts[idx].password_hash = hash;
      await writeAuth(accounts);
      return true;
    } else {
      accounts.push({
        id: Date.now(),
        name: emailOrUsername,
        email: needle,
        password_hash: hash,
      });
      await writeAuth(accounts);
      return true;
    }
  },

  async clear(): Promise<void> {
    await deleteEncryptedFile(AUTH_ENC_FILE, WEB_AUTH_ENC_KEY, {
      legacyPlaintextPath: AUTH_LEGACY_FILE,
      legacyWebKey: WEB_AUTH_LEGACY_KEY,
    });
    await appStorage.deleteItem(STORAGE_KEYS.proctorAuthCacheAt).catch(() => undefined);
  },
};
