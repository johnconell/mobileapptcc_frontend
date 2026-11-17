import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useExamProcess } from '@/shared/theme/examProcess';
import type { GuidedAccessStatus } from '@/features/examinations/services/guidedAccess';

export function GuidedAccessBlocked({ status, onCheck, inExam = false }: {
  status: GuidedAccessStatus;
  onCheck: () => void;
  inExam?: boolean;
}) {
  const tokens = useExamProcess();
  const isDark = tokens.pageBg === '#0B0D10';

  return (
    <View style={[styles.screen, { backgroundColor: tokens.pageBg }]} accessibilityViewIsModal>
      <View style={[styles.card, { backgroundColor: tokens.cardElevated, borderColor: tokens.cardBorder }]}>
        <ShieldAlert size={42} color={tokens.accent} />
        <Text style={[styles.title, { color: tokens.ink }]}>Guided Access Required</Text>
        <Text style={[styles.body, { color: tokens.ink }]}>
          {inExam
            ? 'The examination is locked and your answers are saved. Restore Guided Access to continue, if your examination is still active.'
            : 'Guided Access must be active before you can enter the examination lobby.'}
        </Text>
        {status === 'unavailable' ? (
          <Text style={[styles.warning, { color: tokens.error }]}>This app build cannot verify Guided Access. Install the latest iOS build or contact your proctor.</Text>
        ) : (
          <View style={styles.steps}>
            <Text style={[styles.step, { color: tokens.ink }]}>1. Open Settings, tap Accessibility, then Guided Access. Turn it on.</Text>
            <Text style={[styles.step, { color: tokens.ink }]}>2. Return to this app and triple-click your device button:</Text>
            <View style={styles.substeps}>
              <Text style={[styles.substep, { color: tokens.muted }]}>• Home Button on iPhone 7, 8, SE, and classic iPads</Text>
              <Text style={[styles.substep, { color: tokens.muted }]}>• Side Button on iPhones with Face ID (iPhone X or newer)</Text>
              <Text style={[styles.substep, { color: tokens.muted }]}>• Top Button on iPads without a Home Button</Text>
            </View>
            <Text style={[styles.step, { color: tokens.ink }]}>3. Tap Start in the top-right corner.</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={onCheck} style={[styles.button, { backgroundColor: tokens.accent }]}>
          <Text style={[styles.buttonText, { color: isDark ? tokens.cardBg : '#FFFFFF' }]}>Check Guided Access</Text>
        </Pressable>
        <View style={styles.waiting}>
          <ActivityIndicator size="small" color={tokens.accent} />
          <Text style={[styles.waitingText, { color: tokens.muted }]}>Waiting for Apple device verification</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, zIndex: 1000, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, padding: 24, gap: 16, borderRadius: 20, borderWidth: 1 },
  title: { fontSize: 23, fontFamily: 'System' },
  body: { fontSize: 15, lineHeight: 23, fontFamily: 'System' },
  warning: { fontSize: 14, lineHeight: 21, fontFamily: 'System' },
  steps: { gap: 10 },
  step: { fontSize: 14, lineHeight: 21, fontFamily: 'System' },
  substeps: { paddingLeft: 12, gap: 4 },
  substep: { fontSize: 13, lineHeight: 19, fontFamily: 'System' },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: 'System' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingText: { fontSize: 12, fontFamily: 'System' },
});

