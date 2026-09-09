import { STORAGE_KEYS } from '@/constants';
import { ExamPreloader } from '@/services/examPreloader';
import { ExamProgressStore } from '@/services/examProgressStore';
import { OfflineStore } from '@/services/offlineStore';
import { PeerExamClient } from '@/services/peerExamClient';
import { appStorage } from '@/services/storage';

/**
 * Removes examination questions/modules from an applicant phone after submit.
 * Does not delete a proctor's own exam pack (proctor token present).
 */
export async function clearApplicantExamMaterial(): Promise<void> {
  await ExamPreloader.clear();
  await ExamProgressStore.clear();
  await PeerExamClient.clear().catch(() => undefined);

  await appStorage.deleteItem(STORAGE_KEYS.participationToken);
  await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
  await appStorage.deleteItem(STORAGE_KEYS.examinationCode);
  await appStorage.deleteItem(STORAGE_KEYS.offlineExamCode);
  await appStorage.deleteItem(STORAGE_KEYS.offlineScheduleId);
  await appStorage.deleteItem('tcc.student.exam.passkey');
  await appStorage.deleteItem(STORAGE_KEYS.offlineMode);

  await OfflineStore.clearLocalClaim();
  await OfflineStore.setOfflineMode(false);

  const proctorToken = await appStorage.getItem(STORAGE_KEYS.proctorToken);
  if (!proctorToken) {
    await OfflineStore.clearPackFiles();
  }
}
