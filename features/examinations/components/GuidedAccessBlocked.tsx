import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { examProcess } from '@/shared/theme/examProcess';
import type { GuidedAccessStatus } from '@/features/examinations/services/guidedAccess';

export function GuidedAccessBlocked({ status, onCheck, inExam = false }: {
  status: GuidedAccessStatus;
  onCheck: () => void;
  inExam?: boolean;
}) {
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={styles.card}>
        <ShieldAlert size={42} color={examProcess.accent} />
        <Text style={styles.title}>Guided Access Required</Text>
        <Text style={styles.body}>
          {inExam
            ? 'The examination is locked and your answers are saved. Restore Guided Access to continue, if your examination is still active.'
            : 'Guided Access must be active before you can enter the examination lobby.'}
        </Text>
        {status === 'unavailable' ? (
          <Text style={styles.warning}>This app build cannot verify Guided Access. Install the latest iOS build or contact your proctor.</Text>
        ) : (
          <View style={styles.steps}>
            <Text style={styles.step}>1. Open Settings, then Accessibility, then Guided Access. Turn it on.</Text>
            <Text style={styles.step}>2. Return to this app and triple-click the Side Button.</Text>
            <Text style={styles.step}>3. Tap Start. This screen will unlock after verification.</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={onCheck} style={styles.button}>
          <Text style={styles.buttonText}>Check Guided Access</Text>
        </Pressable>
        <View style={styles.waiting}><ActivityIndicator size="small" color={examProcess.accent} /><Text style={styles.waitingText}>Waiting for iPhone verification</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: examProcess.pageBg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, padding: 24, gap: 16, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e7d9d8' },
  title: { fontSize: 23, fontFamily: examProcess.fontSemiBold, color: examProcess.ink },
  body: { fontSize: 15, lineHeight: 23, fontFamily: examProcess.fontRegular, color: examProcess.ink },
  warning: { fontSize: 14, lineHeight: 21, color: '#9b2c2c', fontFamily: examProcess.fontMedium },
  steps: { gap: 11 },
  step: { fontSize: 14, lineHeight: 21, color: examProcess.ink, fontFamily: examProcess.fontRegular },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: examProcess.accent, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontFamily: examProcess.fontMedium },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingText: { fontSize: 12, color: examProcess.muted, fontFamily: examProcess.fontRegular },
});
