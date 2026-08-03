import React, { useState } from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { colors, shadows } from '@/theme';

interface ExamWifiDisconnectOverlayProps {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  onSubmitCode: (code: string) => void | Promise<void>;
}

export function ExamWifiDisconnectOverlay({
  visible,
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
          <Text style={styles.title}>Disconnected from Wi‑Fi</Text>
          <Text style={styles.message}>
            Your examination is locked because Wi‑Fi was turned off or lost. Ask
            your proctor for a reconnect code. Do not use mobile data to search
            for answers.
          </Text>
          <Input
            label="Reconnect code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="Enter 6-digit code"
            editable={!loading}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Reconnect"
            size="lg"
            fullWidth
            loading={loading}
            disabled={code.trim().length < 4 || loading}
            onPress={() => void onSubmitCode(code.trim())}
          />
          <Text style={styles.hint}>
            After reconnecting, stay on campus Wi‑Fi for the rest of the exam.
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
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
});
