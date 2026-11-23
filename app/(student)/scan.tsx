import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  AppState,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { classifyPeerReconnectError } from '@/features/examinations/services/peerReconnectErrors';
import {
  normalizeExaminationCode,
  parsePeerQr,
  type PeerQrTarget,
} from '@/features/examinations/services/peerExamServer';
import { discoverPeerExamHostByCode } from '@/features/monitoring/services/peerLanDiscovery';
import {
  EXAM_WIFI_JOIN_MESSAGE,
  getExamineeWifiState,
  retainExamineeWifiUsage,
  subscribeExamineeWifi,
} from '@/features/monitoring/services/examineeWifiBinding';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import * as Network from 'expo-network';
import { DeviceService } from '@/shared/services/DeviceService';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';
import { userFacingError } from '@/shared/utils/userFacingError';
import { debugEvent } from '@/shared/utils/debugDiagnostics';

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

const PROCTOR_UNREACHABLE = 'PROCTOR_UNREACHABLE';
const WIFI_CHECK_TIMEOUT_MS = 3000;

async function raceWithFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve(fallback);
    }, timeoutMs);
  });
  try {
    return { value: await Promise.race([promise, timeout]), timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePeerTarget(target: PeerQrTarget) {
  await PeerExamClient.setTarget(target);
  if (!(await PeerExamClient.ensureReachable(target))) {
    throw new Error(PROCTOR_UNREACHABLE);
  }
  return PeerExamClient.requestWithRetry<{
    schedule?: { id?: number; title?: string };
    session?: { id?: number; roomId?: number };
    examinationCode?: string;
    status?: string;
  }>('/resolve', {
    method: 'POST',
    body: { code: target.code },
    timeoutMs: 3000,
  });
}

export default function JoinExaminationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const reconnectMode = params.mode === 'reconnect';
  const initialMode: JoinMode = params.mode === 'code' ? 'code' : 'scan';
  const [mode, setMode] = useState<JoinMode>(initialMode);
  const theme = useExamineeRedesignTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const permissionRequestStarted = useRef(false);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [wifiConnected, setWifiConnected] = useState<boolean | null>(null);
  const [roomCodeFocused, setRoomCodeFocused] = useState(false);
  const setScannedSession = useStudentStore((s) => s.setScannedSession);
  const lastScanAt = useRef(0);

  React.useEffect(() => {
    const mountedAt = Date.now();
    debugEvent('scanner.mount', { initialMode: mode });
    return () => debugEvent('scanner.unmount', { durationMs: Date.now() - mountedAt });
  }, []);

  React.useEffect(() => {
    let active = true;
    void retainExamineeWifiUsage();
    void getExamineeWifiState().then((state) => {
      if (active) setWifiConnected(state.isWifi);
    });
    const unsubscribe = subscribeExamineeWifi((isWifi) => {
      if (active) setWifiConnected(isWifi);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    debugEvent('scanner.permission', {
      granted: permission?.granted ?? null,
      canAskAgain: permission?.canAskAgain ?? null,
    });
  }, [permission?.granted, permission?.canAskAgain]);

  React.useEffect(() => {
    debugEvent('scanner.state', {
      mode,
      scanning,
      busy,
      permissionGranted: permission?.granted ?? false,
    });
  }, [mode, scanning, busy, permission?.granted]);

  React.useEffect(() => {
    if (
      mode !== 'scan' ||
      !permission ||
      permission.granted ||
      !permission.canAskAgain ||
      permissionRequestStarted.current
    ) {
      return;
    }
    permissionRequestStarted.current = true;
    void requestPermission().then((result) => {
      debugEvent('scanner.permission_result', {
        granted: result.granted,
        canAskAgain: result.canAskAgain,
      });
      if (!result.granted) {
        setCameraError(
          result.canAskAgain
            ? 'Camera access is needed to scan the proctor QR code.'
            : 'Camera access is blocked for this app. Open Android settings and allow Camera, then return here.',
        );
      } else {
        setCameraError(null);
      }
    });
  }, [mode, permission, requestPermission]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || mode !== 'scan') return;
      permissionRequestStarted.current = false;
      setScanning(true);
      if (permission?.granted) {
        setCameraError(null);
        return;
      }
      // A blocked permission can change while the applicant is in Android
      // Settings. Re-query it on return so the camera remounts immediately.
      if (permission?.canAskAgain === false) {
        void requestPermission().then((result) => {
          setCameraError(
            result.granted
              ? null
              : 'Camera access is blocked for this app. Open Android settings and allow Camera, then return here.',
          );
        });
      } else {
        setCameraError(null);
      }
    });
    return () => subscription.remove();
  }, [mode, permission?.canAskAgain, permission?.granted, requestPermission]);

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
    useStudentStore.getState().setAgreedAt(null);
    useLobbyStore.getState().setSnapshot(null);
    await appStorage.deleteItem(STORAGE_KEYS.participationToken);
    await appStorage.deleteItem(STORAGE_KEYS.studentProgress);
    const { ExamLifecycle } = await import('@/features/examinations/services/examLifecycle');
    await ExamLifecycle.clear();
    const { ExamProgressStore } = await import('@/features/examinations/services/examProgressStore');
    await ExamProgressStore.clear();
  };

  const resolveAndJoin = async (input: string, type: 'qr' | 'code') => {
    if (busy) return;
    const startedAt = Date.now();
    debugEvent('join.start', { inputType: type });
    setBusy(true);
    if (type === 'qr') setScanning(false);
    setError(null);

    try {
      const wifiBinding = await raceWithFallback(
        retainExamineeWifiUsage(),
        WIFI_CHECK_TIMEOUT_MS,
        undefined,
      );
      if (wifiBinding.timedOut) {
        debugEvent('join.wifi_timeout', {
          operation: 'retainExamineeWifiUsage',
          timeoutMs: WIFI_CHECK_TIMEOUT_MS,
        });
      }

      const netInfo = await raceWithFallback(
        getExamineeWifiState(),
        WIFI_CHECK_TIMEOUT_MS,
        {
          isWifi: false,
          isConnected: false,
          type: null,
          isConnectionExpensive: null,
        },
      );
      const wifiState = netInfo.value;
      if (netInfo.timedOut) {
        debugEvent('join.wifi_timeout', {
          operation: 'NetInfo.fetch',
          timeoutMs: WIFI_CHECK_TIMEOUT_MS,
        });
      }
      debugEvent('join.wifi_state', {
        isWifi: wifiState.isWifi,
        isConnected: wifiState.isConnected,
        type: wifiState.type,
        isConnectionExpensive: wifiState.isConnectionExpensive,
        netInfoTimedOut: netInfo.timedOut,
      });
      if (!wifiState.isWifi) {
        setError('Connect to the exam WiFi.');
        return;
      }

      const rawInput = (input || '').trim();
      if (!rawInput) {
        throw new Error(type === 'code' ? 'Please enter an examination code.' : 'Invalid QR code.');
      }

      const trimmed = type === 'code' ? normalizeExaminationCode(rawInput) : rawInput;

      // 1. OFFLINE PEER QR RESOLUTION: Direct local connection - ZERO internet calls!
      const peerTarget = parsePeerQr(trimmed);
      if (reconnectMode && !peerTarget) {
        throw new Error('Scan the proctor QR code for this same examination to reconnect.');
      }
      if (peerTarget) {
        if (reconnectMode) {
          const existingTarget = await PeerExamClient.getTarget();
          const storedCode = await appStorage.getItem(STORAGE_KEYS.examinationCode);
          const expectedCode = (existingTarget?.code || storedCode || '').trim().toUpperCase();
          if (!expectedCode || peerTarget.code.trim().toUpperCase() !== expectedCode) {
            throw new Error('Scan the QR code for the same examination you were taking.');
          }

          await PeerExamClient.setTarget(peerTarget);
          if (!(await PeerExamClient.ensureReachable(peerTarget))) {
            throw new Error(PROCTOR_UNREACHABLE);
          }
          const pulse = await LobbyRepository.sendHeartbeat();
          if (pulse.removed || pulse.myStatus === 'terminated') {
            router.back();
            return;
          }
          if (pulse.sessionNotFound) {
            router.back();
            return;
          }
          if (!pulse.ok) {
            throw new Error(
              classifyPeerReconnectError(pulse.message || 'Cannot reach the proctor with this QR code.'),
            );
          }

          // A recovery scan changes only the saved host target. Keep the same
          // applicant, participation token, device ID, answers, and timer.
          router.back();
          return;
        }

        const resolved = await resolvePeerTarget(peerTarget);
        let scheduleId = peerTarget.scheduleId;
        let roomId = peerTarget.roomId;
        let examCode = peerTarget.code;
        if (resolved.schedule?.id) scheduleId = Number(resolved.schedule.id);
        if (resolved.session?.roomId || resolved.session?.id) {
          roomId = Number(resolved.session.roomId || resolved.session.id);
        }
        if (resolved.examinationCode) examCode = resolved.examinationCode;

        await LobbyRepository.persistExaminationCode(examCode || trimmed.toUpperCase());
        await clearPriorSession();
        setScannedSession(
          String(scheduleId ?? '1'),
          String(roomId ?? '1'),
        );
        await OfflineStore.setOfflineMode(true);
        router.replace('/(student)/passkey');
        return;
      }

      if (type === 'qr' && trimmed.startsWith('{')) {
        throw new Error('Invalid or unreadable proctor examination QR code. Please scan the current room QR code again.');
      }

      // 2. Extract code / token for manual typing or plain QR text
      let code: string | undefined;
      let token: string | undefined;

      if (type === 'code') {
        code = trimmed.toUpperCase();
      } else {
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.token) token = String(parsed.token).trim();
            if (parsed.code) code = normalizeExaminationCode(parsed.code);
          } catch {
            // not JSON
          }
        }
        if (!token && !code) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
          if (isUuid) {
            token = trimmed;
          } else {
            code = normalizeExaminationCode(trimmed);
          }
        }
      }

      const deviceId = await DeviceService.getDeviceId();
      const verifiedStudent = useStudentStore.getState().verifiedStudent;
      const selectedStudent = useStudentStore.getState().selectedStudent;
      const studentId = verifiedStudent?.studentId || verifiedStudent?.id || selectedStudent?.studentId || selectedStudent?.id
        ? String(verifiedStudent?.studentId || verifiedStudent?.id || selectedStudent?.studentId || selectedStudent?.id)
        : deviceId;

      // 3. Optional Cloud Resolution: Only when online and not in offline mode
      let cloudResolved: any = null;
      try {
        const netState = await Network.getNetworkStateAsync().catch(() => null);
        const isOffline = await OfflineStore.isOfflineMode().catch(() => false);
        if (!isOffline && netState?.isConnected && netState?.isInternetReachable !== false) {
          cloudResolved = await LobbyRepository.resolveSession({
            code,
            token,
            studentId,
            deviceId,
          });
        }
      } catch (cloudErr: any) {
        if (cloudErr?.status === 409 || cloudErr?.status === 404) {
          throw cloudErr;
        }
        // Cloud unreachable on offline Wi-Fi: proceed to LAN discovery
      }

      if (cloudResolved?.peer_identity_public_key) {
        const cloudTarget: PeerQrTarget = {
          host: cloudResolved.proctor_local_ip,
          port: cloudResolved.proctor_local_port,
          code: cloudResolved.session_code,
          scheduleId: cloudResolved.schedule_id ?? null,
          roomId: cloudResolved.room_id ?? null,
          peerPublicKey: cloudResolved.peer_identity_public_key,
        };
        const resolved = await resolvePeerTarget(cloudTarget);

        if (cloudResolved.passkey) {
          useStudentStore.getState().setExamPasskey(cloudResolved.passkey);
        }

        await LobbyRepository.persistExaminationCode(
          resolved.examinationCode || cloudResolved.session_code || code,
        );

        await clearPriorSession();
        setScannedSession(
          String(cloudResolved.schedule_id ?? cloudResolved.session_id),
          String(cloudResolved.session_id),
        );
        router.replace('/(student)/passkey');
        return;
      }

      // 4. Offline LAN Discovery for typed examination code
      if (code) {
        const discovered = await discoverPeerExamHostByCode(code).catch(() => null);
        if (discovered) {
          const resolved = await resolvePeerTarget(discovered);
          let scheduleId = discovered.scheduleId;
          let roomId = discovered.roomId;
          let examCode = discovered.code || code;
          if (resolved.schedule?.id) scheduleId = Number(resolved.schedule.id);
          if (resolved.session?.roomId || resolved.session?.id) {
            roomId = Number(resolved.session.roomId || resolved.session.id);
          }
          if (resolved.examinationCode) examCode = resolved.examinationCode;

          await LobbyRepository.persistExaminationCode(examCode || code);

          await clearPriorSession();
          setScannedSession(
            String(scheduleId ?? '1'),
            String(roomId ?? '1'),
          );
          await OfflineStore.setOfflineMode(true);
          router.replace('/(student)/passkey');
          return;
        }
      }

      await LobbyRepository.persistExaminationCode(code);
      throw new Error(PROCTOR_UNREACHABLE);
    } catch (err: any) {
      debugEvent('join.error', {
        elapsedMs: Date.now() - startedAt,
        status: typeof err?.status === 'number' ? err.status : null,
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      if (err?.status === 409) {
        setError('This student account has already joined this examination session from another device.');
      } else if (err?.status === 404) {
        setError('This code is no longer valid, ask your proctor for a new one.');
      } else {
        const rawMessage = err instanceof Error ? err.message : '';
        const peerError = classifyPeerReconnectError(rawMessage);
        setError(
          rawMessage === PROCTOR_UNREACHABLE || peerError === 'Cannot reach the proctor'
            ? 'Cannot reach the proctor. Make sure you are on the same WiFi as the proctor and try again.'
            : userFacingError(
                err,
                "Cannot connect to the proctor's device. Check your local network connection and scan the current room QR code again.",
              ),
        );
      }
      if (type === 'qr') {
        setScanning(true);
      }
    } finally {
      debugEvent('join.end', { elapsedMs: Date.now() - startedAt });
      setBusy(false);
    }
  };

  const handlePayload = async (raw: string) => {
    if (busy) return;
    const now = Date.now();
    if (now - lastScanAt.current < 1500) return;
    lastScanAt.current = now;
    await resolveAndJoin(raw, 'qr');
  };

  const onVerifyCode = handleSubmit(async (values) => {
    await resolveAndJoin(values.code, 'code');
  });

  const simulateScan = async () => {
    try {
      const stored = await LobbyRepository.getLobby();
      const val = stored?.qrValue || stored?.examinationCode;
      if (val) {
        await resolveAndJoin(val, 'qr');
        return;
      }
      setMode('code');
    } catch (err) {
      setError(userFacingError(err, 'Unable to read the saved examination code. Please scan the proctor QR code.'));
    }
  };

  const close = () =>
    reconnectMode ? router.back() : router.replace('/');

  const cameraReady = Boolean(permission?.granted);
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ExamineeRedesignChrome
        step={0}
        title="Join the Examination"
        stepLabel="Step 1 of 6 · Join"
        onBack={close}
        backLabel="Cancel"
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            disabled={isSubmitting || busy}
            onPress={onVerifyCode}
            style={[
              styles.primaryButton,
              { backgroundColor: theme.primary },
              (isSubmitting || busy) && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: theme.white }]}>
              {isSubmitting || busy ? (mode === 'scan' ? 'Scanning…' : 'Verifying…') : 'Continue'}
            </Text>
          </Pressable>
        }
      >
        <Text style={[styles.intro, { color: theme.secondaryText }]}>
          Scan the proctor&apos;s QR code, or type the room code below.
        </Text>
        {wifiConnected === false ? (
          <View
            style={[
              styles.warningChip,
              { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder },
            ]}
          >
            <Text style={[styles.warningText, { color: theme.error }]}>{EXAM_WIFI_JOIN_MESSAGE}</Text>
          </View>
        ) : null}

        <View style={[styles.cameraBox, { backgroundColor: theme.cameraBackground }]}>
          <View style={[styles.cameraFrame, { backgroundColor: theme.cameraBackground }]}>
            {cameraReady ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                active={mode === 'scan' && scanning && !busy}
                onCameraReady={() => debugEvent('scanner.camera_ready')}
                autofocus="on"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onMountError={({ message }) => {
                  debugEvent('scanner.camera_error', { message });
                  setCameraError(
                    message ||
                      'The camera could not start. Allow camera access and try again, or enter the examination code manually.',
                  );
                }}
                onBarcodeScanned={
                  scanning && !busy
                    ? ({ data, type }) => {
                        if (type !== 'qr') {
                          debugEvent('scanner.scan_ignored', { reason: 'not_qr' });
                          return;
                        }
                        if (typeof data !== 'string' || !data.trim()) {
                          debugEvent('scanner.scan_ignored', { reason: 'empty_data' });
                          return;
                        }
                        debugEvent('scanner.scan_received', { type });
                        void handlePayload(data);
                      }
                    : undefined
                }
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.cameraFallback, { backgroundColor: theme.cameraBackground }]}>
                <Text style={[styles.cameraFallbackTitle, { color: theme.white }]}>Camera access needed</Text>
                <Text style={[styles.cameraFallbackText, { color: theme.white }]}>
                  Allow camera access to scan the proctor QR code.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Allow Camera"
                  onPress={() => {
                    if (permission?.canAskAgain === false) {
                      void Linking.openSettings();
                      return;
                    }
                    permissionRequestStarted.current = true;
                    void requestPermission().then((result) => {
                      debugEvent('scanner.permission_result', {
                        granted: result.granted,
                        canAskAgain: result.canAskAgain,
                      });
                      setCameraError(
                        result.granted
                          ? null
                          : result.canAskAgain
                            ? 'Camera access is needed to scan the proctor QR code.'
                            : 'Camera access is blocked for this app. Open Android settings and allow Camera, then return here.',
                      );
                    });
                  }}
                  style={[styles.cameraButton, { backgroundColor: theme.gold }]}
                >
                  <Text style={[styles.cameraButtonText, { color: theme.text }]}>
                    {permission?.canAskAgain === false ? 'Open Camera Settings' : 'Allow Camera'}
                  </Text>
                </Pressable>
              </View>
            )}
            {cameraReady ? <View style={styles.viewfinderRing} pointerEvents="none" /> : null}
          </View>
        </View>

        {cameraError ? (
          <View style={[styles.warningChip, { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder }]}>
            <View style={[styles.warningDot, { backgroundColor: theme.warningBorder }]} />
            <Text style={[styles.warningText, { color: theme.text }]}>{cameraError}</Text>
          </View>
        ) : null}

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <Text style={[styles.dividerText, { color: theme.secondaryText }]}>or enter room code</Text>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
        </View>

        <Text style={[styles.fieldLabel, { color: theme.text }]}>Room code</Text>
        <Controller
          control={control}
          name="code"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
                Boolean(errors.code || error) && { borderColor: theme.error },
              ]}
              placeholder={roomCodeFocused ? '' : 'K7M2P9QX'}
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
              autoCorrect={false}
              value={value}
              onChangeText={(text) => onChange(text.toUpperCase())}
              onFocus={() => setRoomCodeFocused(true)}
              onBlur={() => {
                onBlur();
                setRoomCodeFocused(false);
              }}
              onSubmitEditing={onVerifyCode}
            />
          )}
        />
        {errors.code?.message ? <Text style={[styles.error, { color: theme.error }]}>{errors.code.message}</Text> : null}
        {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

        {/*
          <>
            <Text style={[styles.fieldLabel, { color: tokens.ink }]}>Examination Code</Text>
            <Controller
              control={control}
              name="code"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: tokens.inputBg,
                      borderColor: tokens.inputBorder,
                      color: tokens.ink,
                    },
                    Boolean(errors.code) && { borderColor: tokens.error },
                  ]}
                  placeholder="K7M2P9QX"
                  placeholderTextColor={tokens.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={value}
                  onChangeText={(text) => onChange(text.toUpperCase())}
                  onBlur={onBlur}
                  onSubmitEditing={onVerifyCode}
                />
              )}
            />
            {errors.code?.message ? <Text style={[styles.error, { color: tokens.error }]}>{errors.code.message}</Text> : null}
            {error ? <Text style={[styles.error, { color: tokens.error }]}>{error}</Text> : null}
            <ExamProcessActions>
              <ExamProcessButton
                title={isSubmitting || busy ? 'Verifying…' : 'Continue'}
                loading={isSubmitting || busy}
                onPress={onVerifyCode}
              />
            </ExamProcessActions>
          </>
        ) : (
          <>
            <View style={[styles.qrCard, { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}>
              <View style={styles.cameraFrame}>
                {cameraReady ? (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    active={mode === 'scan' && scanning && !busy}
                    autofocus="on"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onMountError={({ message }) => {
                      setCameraError(
                        message ||
                          'The camera could not start. Allow camera access and try again, or enter the examination code manually.',
                      );
                    }}
                    onBarcodeScanned={
                      scanning && !busy
                        ? ({ data, type }) => {
                            if (type !== 'qr' || typeof data !== 'string' || !data.trim()) return;
                            void handlePayload(data);
                          }
                        : undefined
                    }
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.cameraFallback]}>
                    {!permission ? (
                      <Text style={styles.cameraFallbackText}>Checking camera permission…</Text>
                    ) : (
                      <>
                        <Text style={styles.cameraFallbackTitle}>Camera access required</Text>
                        <Text style={styles.cameraFallbackText}>
                          Allow camera access to scan the proctor QR, or switch to Enter code.
                        </Text>
                      </>
                    )}
                  </View>
                )}
                {cameraReady ? <View style={styles.viewfinderRing} pointerEvents="none" /> : null}
              </View>
            </View>

            {cameraError ? <Text style={[styles.error, { color: tokens.error }]}>{cameraError}</Text> : null}
            {error ? <Text style={[styles.error, { color: tokens.error }]}>{error}</Text> : null}

            {__DEV__ ? (
              <Pressable
                style={[styles.devBtn, { backgroundColor: tokens.cardElevated }]}
                onPress={() => void simulateScan()}
              >
                <Text style={[styles.devBtnText, { color: tokens.ink }]}>{busy ? '…' : 'Simulate scan'}</Text>
              </Pressable>
            ) : null}

            {!permission?.granted ? (
              <ExamProcessActions>
                <ExamProcessButton
                  title={permission?.canAskAgain === false ? 'Open Camera Settings' : 'Allow Camera'}
                  onPress={() => {
                    if (permission?.canAskAgain === false) {
                      void Linking.openSettings();
                      return;
                    }
                    permissionRequestStarted.current = true;
                    void requestPermission().then((result) => {
                      setCameraError(
                        result.granted
                          ? null
                          : result.canAskAgain
                            ? 'Camera access is needed to scan the proctor QR code.'
                            : 'Camera access is blocked for this app. Open Android settings and allow Camera, then return here.',
                      );
                    });
                  }}
                />
              </ExamProcessActions>
            ) : busy ? (
              <ExamProcessActions>
                <ExamProcessButton title="Scanning…" loading disabled onPress={() => undefined} />
              </ExamProcessActions>
            ) : null}
          </>
        )}
        */}
      </ExamineeRedesignChrome>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  cameraBox: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cameraFrame: {
    flex: 1,
    overflow: 'hidden',
  },
  cameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  cameraFallbackTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  cameraFallbackText: {
    maxWidth: 260,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  cameraButton: {
    minHeight: 48,
    paddingHorizontal: 26,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  viewfinderRing: {
    ...StyleSheet.absoluteFillObject,
    margin: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  warningChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  warningDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Poppins_500Medium',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  codeInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 3,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Poppins_500Medium',
    marginTop: -6,
  },
  primaryButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: examineeRedesignLayout.gap,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
