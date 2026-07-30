import React from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { colors, shadows } from '@/theme';

interface ExamSecurityOverlayProps {
  visible: boolean;
  violationCount: number;
  maxViolations: number;
  message?: string;
  onContinue: () => void;
  onSubmit: () => void;
}

export function ExamSecurityOverlay({
  visible,
  violationCount,
  maxViolations,
  message = 'Leaving the examination is prohibited.',
  onContinue,
  onSubmit,
}: ExamSecurityOverlayProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <ShieldAlert size={36} color={colors.danger} />
          </View>
          <Text style={styles.title}>Secure Examination Mode</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.counter}>
            <Text style={styles.counterText}>Warnings: {violationCount}</Text>
            <Text style={styles.counterText}>Maximum Allowed: {maxViolations}</Text>
          </View>
          <Text style={styles.hint}>
            You cannot leave this examination until it is submitted. Further violations may
            automatically terminate your attempt.
          </Text>
          <Button title="Continue Examination" size="lg" fullWidth onPress={onContinue} />
          <Button title="Submit Examination" variant="outline" size="lg" fullWidth onPress={onSubmit} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    ...shadows.card,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.inkSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  counter: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  counterText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
