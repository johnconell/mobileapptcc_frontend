import React, { useEffect } from 'react';
import { AppState, Text, StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { ExamProcessChrome } from '@/features/examinations/components/ExamProcessChrome';
import { Loader } from '@/shared/components/ui';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { examProcess } from '@/shared/theme/examProcess';

export default function SubmittingScreen() {
  useKeepAwake();
  const terminationReason = useExamStore((s) => s.terminationReason);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const heartbeat = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await LobbyRepository.sendHeartbeat();
      } finally {
        inFlight = false;
      }
    };

    void heartbeat();
    const interval = setInterval(() => void heartbeat(), 10_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat();
    });

    return () => {
      active = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, []);

  return (
    <ExamProcessChrome step={5} title="Submitting" stepLabel="Step 6 of 6 · Done">
      <Loader
        label={
          terminationReason === 'policy_violation'
            ? 'Terminating examination…'
            : terminationReason === 'time_expired'
              ? 'Time is up — submitting your examination…'
              : 'Submitting your examination…'
        }
      />
      <Text style={styles.note}>
        Submitting... do not close the app. Your answers are saved on this phone, and the app will
        retry until the server confirms your submission.
      </Text>
    </ExamProcessChrome>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: 12,
    fontSize: 13,
    color: examProcess.muted,
    fontWeight: '500',
    textAlign: 'center',
  },
});
