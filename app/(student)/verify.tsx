import React from 'react';
import { useRouter } from 'expo-router';
import { Loader } from '@/components/ui';
import { useStudentStore } from '@/stores';

/** Name-list claim is retired. Live join is passkey-only. */
export default function VerifyStudentScreen() {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);

  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      router.replace('/(student)/lobby');
      return;
    }
    if (scannedSessionId) {
      router.replace('/(student)/passkey');
      return;
    }
    router.replace('/');
  }, [scannedSessionId, verifiedStudent, router]);

  return <Loader fullscreen label="Opening examination…" />;
}
