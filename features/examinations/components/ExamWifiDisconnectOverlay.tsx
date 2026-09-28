import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { userFacingError } from '@/shared/utils/userFacingError';

interface ExamWifiDisconnectOverlayProps {
  visible: boolean;
  requiresPin: boolean;
  loading?: boolean;
  error?: string | null;
  /** Proctor ended/closed the exam while this student was disconnected. */
  examinationEnded?: boolean;
  /**
   * Student is connected to a different Wi-Fi network (not the exam SSID).
   * This is a student-controlled action and counts as a violation.
   */
  wrongNetwork?: boolean;
  /** Proctor changed Wi‑Fi / LAN IP — not an examinee fault. */
  proctorNetworkChanged?: boolean;
  /** Seconds remaining in the 2-minute grace period before auto-submit. */
  graceSecondsRemaining?: number;
  onSubmitCode: (code: string) => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onExitEnded?: () => void | Promise<void>;
}

export function ExamWifiDisconnectOverlay({
  visible,
  requiresPin,
  loading = false,
  error = null,
  examinationEnded = false,
  wrongNetwork = false,
  proctorNetworkChanged = false,
  graceSecondsRemaining,
  onSubmitCode,
  onRetry,
  onExitEnded,
}: ExamWifiDisconnectOverlayProps) {
  const [code, setCode] = useState('');
  const { theme } = useThemeTokens();
  const renderAction = (title: string, onPress?: () => void | Promise<void>, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => void onPress?.()}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: theme.accent,
          opacity: disabled || loading ? 0.55 : pressed ? 0.86 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.onAccent} />
      ) : (
        <Text style={[styles.actionText, { color: theme.onAccent }]}>{title}</Text>
      )}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.text }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
            <WifiOff size={36} color={theme.accent} />
          </View>

          {examinationEnded ? (
            <>
              <Text style={[styles.title, { color: theme.text }]}>Examination ended</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                Tapos na ang examination. Maghihintay lang kayo sa result sa inyong Gmail.
              </Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                Please wait for the official examination result in your Gmail. You can return to the
                home screen — you are no longer in an active exam.
              </Text>
              {renderAction('Return Home', onExitEnded)}
            </>
          ) : wrongNetwork && !requiresPin ? (
            // Student deliberately connected to a different Wi-Fi network.
            <>
              <Text style={[styles.title, { color: theme.text }]}>Wrong Wi‑Fi Network</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                You are connected to a different Wi‑Fi network — not the official examination
                network.
              </Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                Please switch back to the official examination Wi‑Fi network. Your exam remains
                paused until you reconnect to the correct room network.
              </Text>
              {error ? (
                <Text style={[styles.error, { color: theme.timer.red.text }]}>
                  {userFacingError(error, 'Unable to verify network. Please try again.')}
                </Text>
              ) : null}
              <Text style={[styles.disclaimer, { color: theme.textMuted }]}>Your answers remain saved locally on this phone.</Text>
            </>
          ) : proctorNetworkChanged && !requiresPin ? (
            // Proctor's LAN IP changed — not the student's fault.
            <>
              <Text style={[styles.title, { color: theme.text }]}>Proctor&apos;s connection changed</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                The proctor phone moved to a different Wi‑Fi network or got a new address. Stay on
                the exam Wi‑Fi, then tap Reconnect. This is not counted as a violation.
              </Text>
              {error ? (
                <Text style={[styles.error, { color: theme.timer.red.text }]}>
                  {userFacingError(error, 'Unable to reconnect. Please try again.')}
                </Text>
              ) : null}
              {renderAction('Reconnect', onRetry)}
              <Text style={[styles.disclaimer, { color: theme.textMuted }]}>Your answers remain saved locally on this phone.</Text>
            </>
          ) : (
            // wifi_lost — or wrong_network/proctor_change after grace expiry (PIN required).
            <>
              <Text style={[styles.title, { color: theme.text }]}>{requiresPin ? 'Examination locked' : 'Reconnecting...'}</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {requiresPin
                  ? 'Disconnection exceeded 2 minutes. Campus Wi‑Fi must be restored and a proctor must issue a 6-digit PIN to unlock your exam.'
                  : 'Wi‑Fi connection lost. Attempting to reconnect automatically...'}
              </Text>

              {/* Grace period countdown — shown while not yet PIN-locked */}
              {!requiresPin && typeof graceSecondsRemaining === 'number' && graceSecondsRemaining > 0 && (
                <Text style={[styles.graceCountdown, { color: theme.timer.orange.text }]}>
                  {`Auto-submitting in ${graceSecondsRemaining}s if not reconnected…`}
                </Text>
              )}

              {requiresPin ? (
                <>
                  <View style={styles.pinInputGroup}>
                    <Text style={[styles.pinInputLabel, { color: theme.textSecondary }]}>6-digit reconnect PIN</Text>
                    <TextInput
                    value={code}
                    onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="e.g. 482917"
                    placeholderTextColor={theme.textMuted}
                    editable={!loading}
                    autoFocus
                    style={[styles.pinInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
                    />
                  </View>
                  {error ? (
                    <Text style={[styles.error, { color: theme.timer.red.text }]}>
                      {userFacingError(error, 'Invalid reconnect code. Please try again.')}
                    </Text>
                  ) : null}
                  {renderAction('Unlock & Resume', () => onSubmitCode(code.trim()), code.trim().length !== 6)}
                </>
              ) : (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>Please move closer to the exam Wi‑Fi hotspot.</Text>
              )}

              <Text style={[styles.disclaimer, { color: theme.textMuted }]}>Your answers remain saved locally on this phone.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    gap: 14,
    elevation: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  graceCountdown: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
  pinInputGroup: {
    width: '100%',
    gap: 6,
  },
  pinInputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  pinInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  actionButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
