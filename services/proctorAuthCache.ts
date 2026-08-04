import bcrypt from 'bcryptjs';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

export type CachedProctorAccount = {
  id: number | string;
  name: string;
  email: string;
  password_hash: string;
  status?: string | null;
};

const AUTH_FILE = `${FileSystem.documentDirectory ?? ''}metcc-proctor-auth-cache.json`;

async function writeAuth(rows: CachedProctorAccount[]): Promise<void> {
  const text = JSON.stringify(rows);
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    await appStorage.setItem(STORAGE_KEYS.proctorAuthCache, text);
    return;
  }
  await FileSystem.writeAsStringAsync(AUTH_FILE, text);
}

async function readAuth(): Promise<CachedProctorAccount[]> {
  try {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      const raw = await appStorage.getItem(STORAGE_KEYS.proctorAuthCache);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CachedProctorAccount[];
      return Array.isArray(parsed) ? parsed : [];
    }
    const info = await FileSystem.getInfoAsync(AUTH_FILE);
    if (!info.exists) {
      // Migrate legacy SecureStore cache if present.
      const legacy = await appStorage.getItem(STORAGE_KEYS.proctorAuthCache);
      if (legacy) {
        const parsed = JSON.parse(legacy) as CachedProctorAccount[];
        if (Array.isArray(parsed) && parsed.length) {
          await writeAuth(parsed);
          await appStorage.deleteItem(STORAGE_KEYS.proctorAuthCache);
          return parsed;
        }
      }
      return [];
    }
    const raw = await FileSystem.readAsStringAsync(AUTH_FILE);
    const parsed = JSON.parse(raw) as CachedProctorAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Local cache of proctor accounts (bcrypt hashes) for offline login.
 * Stored in FileSystem — SecureStore's 2KB limit is too small for hash lists.
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
    // Clear legacy SecureStore blob if any.
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
};
