import React from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { Button } from '@/shared/components/ui/Button';
import { colors, shadows } from '@/shared/theme';

interface ExamSecurityOverlayProps {
  visible: boolean;
  violationCount?: number;
  maxViolations?: number;
  message?: string;
  onContinue: () => void;
  onSubmit: () => void;
}

export function ExamSecurityOverlay({
  visible,
  message = 'Screen Pinning is active. Leaving the examination is prohibited.',
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
          <Text style={styles.hint}>
            Your device is locked in kiosk mode via Screen Pinning. You cannot switch apps or leave this examination until your answers are submitted.
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
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
