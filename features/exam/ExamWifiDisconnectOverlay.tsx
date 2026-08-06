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
          <Text style={styles.title}>Examination locked</Text>
          <Text style={styles.message}>
            Wi‑Fi dropped or the exam server lost your heartbeat. Turn campus Wi‑Fi back on,
            then ask your proctor for the 6-digit reconnect PIN on their lobby (shown next to
            your name). Do not enter the room examination / QR code — that will not unlock this
            screen.
          </Text>
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
            title="Reconnect"
            size="lg"
            fullWidth
            loading={loading}
            disabled={code.trim().length !== 6 || loading}
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
