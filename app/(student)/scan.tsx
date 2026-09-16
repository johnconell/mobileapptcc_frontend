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
import { examProcess } from '@/shared/theme/examProcess';

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

  const modeToggle = (
    <View style={styles.modeToggle}>
      <Pressable
        style={[styles.modeSeg, mode === 'scan' && styles.modeSegOn]}
        onPress={() => {
          setMode('scan');
          setError(null);
          setScanning(true);
        }}
      >
        <Text style={[styles.modeText, mode === 'scan' && styles.modeTextOn]}>Scan QR</Text>
      </Pressable>
      <Pressable
        style={[styles.modeSeg, mode === 'code' && styles.modeSegOn]}
        onPress={() => {
          setMode('code');
          setError(null);
        }}
      >
        <Text style={[styles.modeText, mode === 'code' && styles.modeTextOn]}>Enter code</Text>
      </Pressable>
    </View>
  );

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

  if (mode === 'code') {
    return (
      <KeyboardAvoidingView
        style={styles.codeRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ExamProcessChrome
          step={0}
          title="Enter Examination Code"
          stepLabel="Step 1 of 6 · Join"
          onBack={close}
          backLabel="Cancel"
        >
          <Text style={styles.codeIntro}>
            Type the room code from your proctor if the camera is unavailable.
          </Text>
          {modeToggle}
          <Text style={styles.fieldLabel}>Examination Code</Text>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.codeInput, Boolean(errors.code) && styles.inputInvalid]}
                placeholder="K7M2P9QX"
                placeholderTextColor={examProcess.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                value={value}
                onChangeText={(text) => onChange(text.toUpperCase())}
                onBlur={onBlur}
                onSubmitEditing={onVerifyCode}
              />
            )}
          />
          {errors.code?.message ? <Text style={styles.error}>{errors.code.message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ExamProcessActions>
            <ExamProcessButton
              title={isSubmitting || busy ? 'Verifying…' : 'Continue'}
              loading={isSubmitting || busy}
              onPress={onVerifyCode}
            />
          </ExamProcessActions>
        </ExamProcessChrome>
      </KeyboardAvoidingView>
    );
  }

  const cameraReady = Boolean(permission?.granted);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.root}>
        {cameraReady ? (
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 4 }]}
        >
          <X size={18} color={examProcess.white} strokeWidth={2.5} />
        </Pressable>

        {!permission ? (
          <View style={styles.centerNotice}>
            <Text style={styles.noticeText}>Checking camera permission…</Text>
          </View>
        ) : null}
        {permission && !permission.granted ? (
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
        {error ? (
          <View style={[styles.scanErrorWrap, { bottom: 110 + Math.max(insets.bottom, 12) }]}>
            <Text style={styles.scanError}>{error}</Text>
          </View>
        ) : null}

        {__DEV__ ? (
          <Pressable
            style={[styles.devBtn, { bottom: 110 + Math.max(insets.bottom, 12) }]}
            onPress={() => void simulateScan()}
          >
            <Text style={styles.devBtnText}>{busy ? '…' : 'Simulate scan'}</Text>
          </Pressable>
        ) : null}

        <View
          style={[
            styles.toggleWrap,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.togglePill}>
            <Pressable style={[styles.toggleSeg, styles.toggleSegOn]}>
              <Text style={[styles.toggleText, styles.toggleTextOn]}>Scan QR</Text>
            </Pressable>
            <Pressable
              style={styles.toggleSeg}
              onPress={() => {
                setMode('code');
                setError(null);
              }}
            >
              <Text style={styles.toggleText}>Enter code</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const DIM = 'rgba(44, 36, 28, 0.55)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1410' },
  codeRoot: { flex: 1, backgroundColor: examProcess.pageBg },
  fallbackBg: { backgroundColor: '#2C241C' },
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
    borderWidth: 2,
    borderColor: examProcess.white,
    backgroundColor: 'transparent',
  },
  maskBottom: {
    flex: 1.15,
    backgroundColor: DIM,
  },
  heroTitle: {
    color: examProcess.white,
    fontSize: 24,
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
  },
  heroSub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
    fontFamily: examProcess.fontRegular,
  },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    backgroundColor: 'rgba(255,253,248,0.88)',
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
    backgroundColor: examProcess.accent,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
    color: examProcess.ink,
  },
  toggleTextOn: {
    color: examProcess.white,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    backgroundColor: examProcess.cardElevated,
    borderRadius: examProcess.radiusControl,
    padding: 4,
  },
  modeSeg: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSegOn: {
    backgroundColor: examProcess.accent,
  },
  modeText: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    color: examProcess.ink,
  },
  modeTextOn: {
    color: examProcess.white,
  },
  codeIntro: {
    fontSize: 14,
    lineHeight: 21,
    color: examProcess.muted,
    marginBottom: 12,
    fontFamily: examProcess.fontRegular,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
    color: examProcess.ink,
    marginBottom: 6,
  },
  codeInput: {
    backgroundColor: examProcess.inputBg,
    borderWidth: 1,
    borderColor: examProcess.inputBorder,
    borderRadius: examProcess.radiusControl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: examProcess.fontRegular,
    color: examProcess.ink,
    letterSpacing: 1,
  },
  inputInvalid: { borderColor: examProcess.error },
  error: {
    color: examProcess.error,
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    marginTop: 6,
    lineHeight: 18,
  },
  continueBtn: {
    marginTop: 6,
    backgroundColor: examProcess.accent,
    borderRadius: examProcess.radiusControl,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  continueBtnText: {
    color: examProcess.white,
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  centerNotice: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
    backgroundColor: 'rgba(44, 36, 28, 0.55)',
  },
  noticeTitle: {
    color: examProcess.white,
    fontSize: 18,
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
  },
  noticeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontFamily: examProcess.fontRegular,
  },
  scanErrorWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 4,
  },
  scanError: {
    color: examProcess.white,
    backgroundColor: 'rgba(122, 31, 43, 0.9)',
    textAlign: 'center',
    fontFamily: examProcess.fontMedium,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  devBtn: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    zIndex: 4,
  },
  devBtnText: {
    color: examProcess.white,
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
});
