import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import type {
  ExamTerminationReason,
  SecurityViolation,
  SecurityViolationType,
} from '@/shared/types';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { DeviceService } from '@/shared/services/DeviceService';
import { appStorage } from '@/shared/services/storage';
import { apiRequest } from '@/shared/services/api';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  readEncryptedFile,
  StorageFileNotFoundError,
  writeEncryptedFile,
} from '@/shared/services/encryptedStorage';

const INCIDENT_FILE = `${FileSystem.documentDirectory ?? ''}metcc-security-incidents.enc`;
const INCIDENT_WEB_KEY = 'tcc.security.incidents.enc';
const LEGACY_INCIDENT_KEY = 'tcc.exam.guidedAccessIncidents';
const MAX_LOCAL_INCIDENTS = 1000;

type StoredIncident = SecurityViolation & {
  attemptRef?: string | null;
  deviceId?: string | null;
  serverAcknowledgedAt?: string | null;
};

type IncidentAcknowledgement = {
  acknowledged?: boolean;
  data?: { acknowledged?: boolean };
};

let incidentWrite: Promise<void> = Promise.resolve();
let activeFlush: Promise<void> | null = null;

async function loadIncidents(): Promise<StoredIncident[]> {
  try {
    const stored = await readEncryptedFile<StoredIncident[]>(INCIDENT_FILE, INCIDENT_WEB_KEY, {
      legacyWebKey: LEGACY_INCIDENT_KEY,
      type: 'security_incidents',
    });
    return Array.isArray(stored.data) ? stored.data : [];
  } catch (error) {
    if (!(error instanceof StorageFileNotFoundError)) throw error;
    const legacy = await appStorage.getItem(LEGACY_INCIDENT_KEY);
    if (!legacy) return [];
    try {
      const parsed = JSON.parse(legacy) as SecurityViolation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (parseError) {
      throw new Error('Stored security incident history is corrupted.', { cause: parseError });
    }
  }
}

async function saveIncidents(incidents: StoredIncident[]): Promise<void> {
  const pending = incidents.filter((incident) => !incident.serverAcknowledgedAt);
  const maxAcknowledged = Math.max(0, MAX_LOCAL_INCIDENTS - pending.length);
  const acknowledged = maxAcknowledged
    ? incidents.filter((incident) => incident.serverAcknowledgedAt).slice(-maxAcknowledged)
    : [];
  await writeEncryptedFile(INCIDENT_FILE, INCIDENT_WEB_KEY, [...acknowledged, ...pending], {
    meta: { type: 'security_incidents' },
  });
  await appStorage.deleteItem(LEGACY_INCIDENT_KEY);
}

async function updateIncidents(
  update: (incidents: StoredIncident[]) => StoredIncident[],
): Promise<StoredIncident[]> {
  const operation = incidentWrite.then(async () => {
    const saved = update(await loadIncidents());
    await saveIncidents(saved);
    return saved;
  });
  incidentWrite = operation.then(() => undefined, () => undefined);
  return operation;
}

async function eventContext(): Promise<{
  deviceId: string | null;
  attemptRef: string | null;
}> {
  let deviceId: string | null = null;
  try {
    deviceId = await DeviceService.getDeviceId();
  } catch (error) {
    console.warn('[SECURITY INCIDENT] Device attribution is unavailable.', error);
  }
  const attemptId = useExamStore.getState().attemptId;
  let attemptRef: string | null = null;
  if (attemptId) {
    try {
      attemptRef = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, attemptId);
    } catch (error) {
      console.warn('[SECURITY INCIDENT] Attempt attribution could not be hashed.', error);
    }
  }
  return { deviceId, attemptRef };
}

async function deliverPendingIncidents(): Promise<void> {
  if (activeFlush) return activeFlush;
  activeFlush = (async () => {
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return;

    while (true) {
      await incidentWrite;
      const pending = (await loadIncidents()).filter((incident) => !incident.serverAcknowledgedAt);
      const incident = pending[0];
      if (!incident) return;

      const payload = {
        participation_token: token,
        local_event_id: incident.id,
        type: incident.type,
        message: incident.message,
        attempt_ref: incident.attemptRef ?? null,
        device_id: incident.deviceId ?? null,
      };
      let acknowledgement: IncidentAcknowledgement;
      try {
        if (await PeerExamClient.isActive()) {
          acknowledgement = await PeerExamClient.request<IncidentAcknowledgement>('/violation', {
            method: 'POST',
            body: payload,
            timeoutMs: 4000,
          });
        } else {
          acknowledgement = await apiRequest<IncidentAcknowledgement>('/exam/violation', {
            method: 'POST',
            auth: false,
            body: payload,
            timeoutMs: 4000,
          });
        }
      } catch (error) {
        console.warn('[SECURITY INCIDENT] Delivery deferred; incident remains queued.', error);
        return;
      }

      const acknowledged =
        acknowledgement?.acknowledged === true ||
        acknowledgement?.data?.acknowledged === true;
      if (!acknowledged) {
        console.warn('[SECURITY INCIDENT] Server did not acknowledge incident delivery.');
        return;
      }

      await updateIncidents((incidents) =>
        incidents.map((item) =>
          item.id === incident.id
            ? { ...item, serverAcknowledgedAt: new Date().toISOString() }
            : item,
        ),
      );
    }
  })().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

/**
 * Stores incident evidence locally before attempting delivery. Reports are
 * evidence for proctor review; they never automatically terminate an attempt.
 */
export const SecurityRepository = {
  async getMaxViolations(): Promise<number> {
    return 0;
  },

  async recordViolation(input: {
    sessionId: string;
    studentId: string;
    studentName: string;
    type: SecurityViolationType;
    message: string;
  }): Promise<{
    violation: SecurityViolation;
    violationCount: number;
    terminated: boolean;
  }> {
    const context = await eventContext();
    const violation: StoredIncident = {
      id: Crypto.randomUUID(),
      sessionId: input.sessionId,
      studentId: input.studentId,
      studentName: input.studentName,
      type: input.type,
      message: input.message.slice(0, 500),
      createdAt: new Date().toISOString(),
      resolved: false,
      attemptRef: context.attemptRef,
      deviceId: context.deviceId,
    };

    const saved = await updateIncidents((incidents) => [...incidents, violation]);
    void deliverPendingIncidents().catch((error) =>
      console.error('[SECURITY INCIDENT] Could not deliver queued incidents.', error),
    );

    return {
      violation,
      violationCount: saved.filter(
        (item) => item.sessionId === input.sessionId && item.studentId === input.studentId,
      ).length,
      terminated: false,
    };
  },

  async flushPending(): Promise<void> {
    await incidentWrite;
    await deliverPendingIncidents();
  },

  async getViolations(sessionId?: string): Promise<SecurityViolation[]> {
    await incidentWrite;
    const stored = await loadIncidents();
    return sessionId ? stored.filter((item) => item.sessionId === sessionId) : stored;
  },

  async getStudentViolations(studentId: string): Promise<SecurityViolation[]> {
    await incidentWrite;
    return (await loadIncidents()).filter((item) => item.studentId === studentId);
  },

  async resolveViolation(violationId: string): Promise<void> {
    await updateIncidents((incidents) =>
      incidents.map((item) =>
        item.id === violationId ? { ...item, resolved: true } : item,
      ),
    );
  },

  async clearSession(sessionId: string): Promise<void> {
    await updateIncidents((incidents) =>
      incidents.filter((item) => item.sessionId !== sessionId),
    );
  },
};

export type { ExamTerminationReason };
