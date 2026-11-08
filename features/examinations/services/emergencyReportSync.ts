import * as Crypto from 'expo-crypto';
import { OfflineStore, type OfflineEmergencyReport } from '@/features/synchronization/services/offlineStore';
import { apiRequest } from '@/shared/services/api';
import { DeviceService } from '@/shared/services/DeviceService';

export type EmergencyReportSyncResult = {
  synced: number;
  pending: number;
  error?: string;
};

export const EmergencyReportSync = {
  async recordLocalSuspension(input: {
    scheduleId: number;
    roomId: number;
    reason: string;
  }): Promise<EmergencyReportSyncResult> {
    if (!Number.isInteger(input.scheduleId) || input.scheduleId <= 0) {
      throw new Error('Cannot report the emergency without a valid examination schedule.');
    }
    if (!Number.isInteger(input.roomId) || input.roomId <= 0) {
      throw new Error('Cannot report the emergency without a valid examination room.');
    }

    const report: OfflineEmergencyReport = {
      client_report_id: Crypto.randomUUID(),
      examination_schedule_id: input.scheduleId,
      examination_room_id: input.roomId,
      device_id: await DeviceService.getDeviceId(),
      reason: input.reason.trim(),
      started_at: new Date().toISOString(),
      synced: false,
      synced_at: null,
    };
    if (report.reason.length < 5 || report.reason.length > 500) {
      throw new Error('The emergency report reason must be between 5 and 500 characters.');
    }

    await OfflineStore.queueEmergencyReport(report);
    return this.syncPending();
  },

  async syncPending(): Promise<EmergencyReportSyncResult> {
    const pending = await OfflineStore.pendingEmergencyReports();
    let synced = 0;
    for (const report of pending) {
      try {
        await apiRequest('/proctor/emergency-reports', {
          method: 'POST',
          body: report,
        });
        await OfflineStore.markEmergencyReportSynced(report.client_report_id);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Emergency report synchronization failed.';
        console.warn('[EmergencyReportSync] Report remains queued for retry:', message);
        return {
          synced,
          pending: pending.length - synced,
          error: message,
        };
      }
    }
    return { synced, pending: 0 };
  },
};
