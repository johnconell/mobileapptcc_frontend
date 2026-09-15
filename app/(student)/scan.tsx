import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react-native';
import { CampusWifiBlockedCard } from '@/features/monitoring/components/CampusWifiBlockedCard';
import { useCampusWifiJoinGate } from '@/features/monitoring/hooks/useCampusWifiJoinGate';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import {
  ExamProcessActions,
  ExamProcessButton,
  ExamProcessChrome,
} from '@/features/examinations/components/ExamProcessChrome';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Enter the examination code')
    .regex(
      /^(OFF-\d+(?:-R\d+)?|[A-Za-z0-9]{6,12}(-\d{4})?)$/i,
      'Format example: K7M2P9QX or OFF-12-R3',
    ),
});

type CodeForm = z.infer<typeof codeSchema>;
type JoinMode = 'scan' | 'code';

const FRAME = Math.min(Dimensions.get('window').width * 0.68, 260);

export default function JoinExaminationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: JoinMode = params.mode === 'code' ? 'code' : 'scan';
  const [mode, setMode] = useState<JoinMode>(initialMode);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wifiBlocked, setWifiBlocked] = useState(false);
  const setScannedSession = useStudentStore((s) => s.setScannedSession);
  const wifiGate = useCampusWifiJoinGate({ requireServer: true });
  const lastScanAt = useRef(0);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  const clearPriorSession = async () => {
    useStudentStore.getState().setVerifiedStudent(null);
    useStudentStore.getState().setSelectedStudent(null);
    useStudentStore.getState().setExamPasskey(null);
    useLobbyStore.getState().setSnapshot(null);
    await appStorage.deleteItem(STORAGE_KEYS.participationToken);
    await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
    const { ExamLifecycle } = await import('@/features/examinations/services/examLifecycle');
    await ExamLifecycle.clear();
    const { ExamProgressStore } = await import('@/features/examinations/services/examProgressStore');
    await ExamProgressStore.clear();
  };

  const handlePayload = async (raw: string) => {
    if (busy) return;
    const now = Date.now();
    if (now - lastScanAt.current < 1500) return;
    lastScanAt.current = now;

    setBusy(true);
    setScanning(false);
    setError(null);

    const gate = await wifiGate.refresh(raw);
    if (!gate.ok) {
      setError(gate.message ?? 'Wi‑Fi / LAN does not match the proctor network.');
      setWifiBlocked(true);
      setBusy(false);
      return;
    }

    const resolved = await ScheduleRepository.resolveSessionFromQr(raw);
    if (
      !resolved.valid ||
      !resolved.session ||
      !resolved.schedule ||
      resolved.session.status === 'ended'
    ) {
      setError(
        resolved.message ||
          (resolved.session?.status === 'ended'
            ? 'This examination has already ended and is no longer available for applicants.'
            : 'Invalid QR Code.'),
      );
      setBusy(false);
      setScanning(true);
      return;
    }

    await clearPriorSession();
    setScannedSession(resolved.schedule.id, resolved.session.id);
    router.replace('/(student)/passkey');
  };

  const onVerifyCode = handleSubmit(async (values) => {
    setError(null);
    const gate = await assertCampusWifiForJoin({
      examinationCode: values.code,
      requireServer: true,
    });
    if (!gate.ok) {
      setError(
        gate.message ??
          'You are connected to a different examination network. Please connect to the same Wi‑Fi network as the proctor and try again.',
      );
      setWifiBlocked(true);
      return;
    }

    const result = await LobbyRepository.verifyExaminationCode(values.code);
    if (
      !result.valid ||
      !result.session ||
      !result.schedule ||
      result.session.status === 'ended'
    ) {
      setError(
        result.message ||
          (result.session?.status === 'ended'
            ? 'This examination has already ended and is no longer available for applicants.'
            : 'Invalid examination code.'),
      );
      return;
    }

    await clearPriorSession();
    setScannedSession(result.schedule.id, result.session.id);
    router.replace('/(student)/passkey');
  });

  const simulateScan = async () => {
    setBusy(true);
    setError(null);
    try {
      const gate = await wifiGate.refresh();
      if (!gate.ok) {
        setError(gate.message ?? 'Wi‑Fi / LAN does not match the proctor network.');
        setWifiBlocked(true);
        setBusy(false);
        return;
      }
      const stored = await LobbyRepository.getLobby();
      if (stored?.examinationCode) {
        await handlePayload(stored.examinationCode);
        return;
      }
      setBusy(false);
      setMode('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to simulate scan.');
      setBusy(false);
      setScanning(true);
    }
  };

  const close = () => router.replace('/');

  if (wifiBlocked) {
    return (
      <ExamProcessChrome
        step={0}
        title="Join Examination"
        stepLabel="Step 1 of 6 · Join"
        onBack={close}
        backLabel="Cancel"
      >
        <CampusWifiBlockedCard
          title="Different examination network"
          message={
            error ??
            wifiGate.message ??
            'You are connected to a different examination network. Please connect to the same Wi‑Fi network as the proctor and try again.'
          }
          checking={wifiGate.checking}
          onRetry={() => {
            setWifiBlocked(false);
            setError(null);
            setScanning(true);
            setBusy(false);
          }}
        />
        <ExamProcessActions>
          <ExamProcessButton
            title="Try Again"
            onPress={() => {
              setWifiBlocked(false);
              setError(null);
              setScanning(true);
              setBusy(false);
            }}
          />
        </ExamProcessActions>
      </ExamProcessChrome>
    );
  }

  const cameraReady = Boolean(permission?.granted);
  const showLiveCamera = mode === 'scan' && cameraReady;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.root}>
        {showLiveCamera ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanning && !busy
                ? ({ data }) => {
                    void handlePayload(data);
                  }
                : undefined
            }
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />
        )}

        {/* Dimmed mask with clear viewfinder (scan) or full dim (enter code) */}
        {mode === 'scan' ? (
          <View style={styles.mask} pointerEvents="none">
            <View style={styles.maskTop}>
              <Text style={styles.heroTitle}>Scan QR Code</Text>
              <Text style={styles.heroSub}>
                Scan the proctor QR code shown in the examination room.
              </Text>
            </View>
            <View style={styles.maskMiddle}>
              <View style={styles.maskSide} />
              <View style={styles.viewfinder} />
              <View style={styles.maskSide} />
            </View>
            <View style={styles.maskBottom} />
          </View>
        ) : (
          <View style={styles.codeOverlay}>
            <Text style={styles.heroTitle}>Enter Examination Code</Text>
            <Text style={styles.heroSub}>
              Type the room code from your proctor if the camera is unavailable.
            </Text>
            <View style={styles.codeCard}>
              <Text style={styles.fieldLabel}>Examination Code</Text>
              <Controller
                control={control}
                name="code"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, Boolean(errors.code) && styles.inputInvalid]}
                    placeholder="K7M2P9QX"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={value}
                    onChangeText={(text) => onChange(text.toUpperCase())}
                    onBlur={onBlur}
                    onSubmitEditing={onVerifyCode}
                  />
                )}
              />
              {errors.code?.message ? (
                <Text style={styles.error}>{errors.code.message}</Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.continueBtn, (isSubmitting || busy) && styles.btnDisabled]}
                disabled={isSubmitting || busy}
                onPress={onVerifyCode}
              >
                <Text style={styles.continueBtnText}>
                  {isSubmitting ? 'Verifying…' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Close */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 4 }]}
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>

        {/* Permission / errors on scan mode */}
        {mode === 'scan' && !permission ? (
          <View style={styles.centerNotice}>
            <Text style={styles.noticeText}>Checking camera permission…</Text>
          </View>
        ) : null}
        {mode === 'scan' && permission && !permission.granted ? (
          <View style={styles.centerNotice}>
            <Text style={styles.noticeTitle}>Camera access required</Text>
            <Text style={styles.noticeText}>
              Allow camera access to scan the proctor QR, or switch to Enter code.
            </Text>
            <Pressable style={styles.continueBtn} onPress={requestPermission}>
              <Text style={styles.continueBtnText}>Allow Camera</Text>
            </Pressable>
          </View>
        ) : null}
        {mode === 'scan' && error ? (
          <View style={[styles.scanErrorWrap, { bottom: 110 + Math.max(insets.bottom, 12) }]}>
            <Text style={styles.scanError}>{error}</Text>
          </View>
        ) : null}

        {__DEV__ && mode === 'scan' ? (
          <Pressable
            style={[styles.devBtn, { bottom: 110 + Math.max(insets.bottom, 12) }]}
            onPress={() => void simulateScan()}
          >
            <Text style={styles.devBtnText}>{busy ? '…' : 'Simulate scan'}</Text>
          </Pressable>
        ) : null}

        {/* Bottom pill toggle */}
        <View
          style={[
            styles.toggleWrap,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.togglePill}>
            <Pressable
              style={[styles.toggleSeg, mode === 'scan' && styles.toggleSegOn]}
              onPress={() => {
                setMode('scan');
                setError(null);
                setScanning(true);
              }}
            >
              <Text style={[styles.toggleText, mode === 'scan' && styles.toggleTextOn]}>
                Scan code
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleSeg, mode === 'code' && styles.toggleSegOn]}
              onPress={() => {
                setMode('code');
                setError(null);
              }}
            >
              <Text style={[styles.toggleText, mode === 'code' && styles.toggleTextOn]}>
                Enter code
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const DIM = 'rgba(0,0,0,0.58)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0B' },
  fallbackBg: { backgroundColor: '#121212' },
  mask: {
    ...StyleSheet.absoluteFillObject,
  },
  maskTop: {
    flex: 1,
    backgroundColor: DIM,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingBottom: 22,
  },
  maskMiddle: {
    height: FRAME,
    flexDirection: 'row',
  },
  maskSide: {
    flex: 1,
    backgroundColor: DIM,
  },
  viewfinder: {
    width: FRAME,
    height: FRAME,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'transparent',
    // Soft edge glow feel
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  maskBottom: {
    flex: 1.15,
    backgroundColor: DIM,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroSub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
    fontWeight: '500',
  },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  toggleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 5,
  },
  togglePill: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 340,
    borderRadius: 999,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  toggleSeg: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  toggleSegOn: {
    backgroundColor: '#FFFFFF',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.72)',
  },
  toggleTextOn: {
    color: '#111111',
  },
  codeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  codeCard: {
    marginTop: 22,
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  inputInvalid: { borderColor: '#FF6B6B' },
  error: {
    color: '#FF8A80',
    fontSize: 12,
    fontWeight: '600',
  },
  continueBtn: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '800',
  },
  btnDisabled: { opacity: 0.55 },
  centerNotice: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  noticeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  scanErrorWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 4,
  },
  scanError: {
    color: '#FFCDD2',
    backgroundColor: 'rgba(120,20,20,0.75)',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  devBtn: {
    position: 'absolute',
    alignSelf: 'center',
    left: '30%',
    right: '30%',
    zIndex: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  devBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
