import React, { useState } from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { colors, shadows } from '@/theme';

interface ExamWifiDisconnectOverlayProps {
  visible: boolean;
  requiresPin: boolean;
  loading?: boolean;
  error?: string | null;
  onSubmitCode: (code: string) => void | Promise<void>;
}

export function ExamWifiDisconnectOverlay({
  visible,
  requiresPin,
  loading = false,
  error = null,
  onSubmitCode,
}: ExamWifiDisconnectOverlayProps) {
  const [code, setCode] = useState('');

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <WifiOff size={36} color={colors.danger} />
          </View>
          <Text style={styles.title}>{requiresPin ? 'Examination locked' : 'Reconnecting...'}</Text>
          <Text style={styles.message}>
            {requiresPin
              ? 'Disconnection exceeded 30 seconds. Campus Wi‑Fi must be restored and a proctor must issue a 6-digit PIN to unlock your exam.'
              : 'Wi‑Fi connection lost. Attempting to reconnect automatically...'}
          </Text>

          {requiresPin ? (
            <>
              <Input
                label="6-digit reconnect PIN"
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="e.g. 482917"
                editable={!loading}
                autoFocus
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                title="Unlock & Resume"
                size="lg"
                fullWidth
                loading={loading}
                disabled={code.trim().length !== 6 || loading}
                onPress={() => void onSubmitCode(code.trim())}
              />
            </>
          ) : (
            <Text style={styles.hint}>
               Please move closer to the exam Wi‑Fi hotspot.
            </Text>
          )}

          <Text style={styles.disclaimer}>
            Your answers remain saved locally on this phone.
          </Text>
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
    borderRadius: 20,
    padding: 24,
    gap: 14,
    ...shadows.card,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
});
