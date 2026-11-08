import assert from 'node:assert/strict';
import test from 'node:test';
import { clearApplicantExamMaterial } from './applicantExamCleanup';
import { appStorage } from '@/shared/services/storage';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';

test('landing cleanup preserves the downloaded proctor pack', async () => {
  const original = {
    clearPackFiles: OfflineStore.clearPackFiles,
    clearLocalClaim: OfflineStore.clearLocalClaim,
    setOfflineMode: OfflineStore.setOfflineMode,
    preloaderClear: ExamPreloader.clear,
    progressClear: ExamProgressStore.clear,
    peerClear: PeerExamClient.clear,
    getItem: appStorage.getItem,
    deleteItem: appStorage.deleteItem,
  };
  let packClears = 0;
  try {
    OfflineStore.clearPackFiles = async () => { packClears += 1; };
    OfflineStore.clearLocalClaim = async () => undefined;
    OfflineStore.setOfflineMode = async () => undefined;
    ExamPreloader.clear = async () => undefined;
    ExamProgressStore.clear = async () => undefined;
    PeerExamClient.clear = async () => undefined;
    appStorage.getItem = async () => null;
    appStorage.deleteItem = async () => undefined;

    await clearApplicantExamMaterial({ preserveOfflinePack: true });
    assert.equal(packClears, 0);

    await clearApplicantExamMaterial();
    assert.equal(packClears, 1, 'student exam completion retains its existing cleanup policy');
  } finally {
    OfflineStore.clearPackFiles = original.clearPackFiles;
    OfflineStore.clearLocalClaim = original.clearLocalClaim;
    OfflineStore.setOfflineMode = original.setOfflineMode;
    ExamPreloader.clear = original.preloaderClear;
    ExamProgressStore.clear = original.progressClear;
    PeerExamClient.clear = original.peerClear;
    appStorage.getItem = original.getItem;
    appStorage.deleteItem = original.deleteItem;
  }
});
