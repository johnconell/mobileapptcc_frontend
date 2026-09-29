import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { ExamProcessChrome } from '@/features/examinations/components/ExamProcessChrome';
import { Loader } from '@/shared/components/ui';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { examProcess } from '@/shared/theme/examProcess';

export default function SubmittingScreen() {
  useKeepAwake();
  const terminationReason = useExamStore((s) => s.terminationReason);

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
      <Text style={styles.note}>Please keep this screen open.</Text>
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
