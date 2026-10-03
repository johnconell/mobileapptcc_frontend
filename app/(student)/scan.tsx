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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { parsePeerQr } from '@/features/examinations/services/peerExamServer';
import { discoverPeerExamHostByCode } from '@/features/monitoring/services/peerLanDiscovery';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import * as Network from 'expo-network';
import { DeviceService } from '@/shared/services/DeviceService';
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

const FRAME = Math.min(Dimensions.get('window').width * 0.72, 280);

export default function JoinExaminationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: JoinMode = params.mode === 'code' ? 'code' : 'scan';
  const [mode, setMode] = useState<JoinMode>(initialMode);
  const [permission, requestPermission] = useCameraPermissions();
  const permissionRequestStarted = useRef(false);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wifiBlocked, setWifiBlocked] = useState(false);
  const setScannedSession = useStudentStore((s) => s.setScannedSession);
  const wifiGate = useCampusWifiJoinGate({ requireServer: true });
  const lastScanAt = useRef(0);

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
    void requestPermission();
  }, [mode, permission, requestPermission]);

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
    setBusy(true);
    if (type === 'qr') setScanning(false);
    setError(null);
    setWifiBlocked(false);

    try {
      const trimmed = (input || '').trim();
      if (!trimmed) {
        throw new Error(type === 'code' ? 'Please enter an examination code.' : 'Invalid QR code.');
      }

      // 1. OFFLINE PEER QR RESOLUTION: Direct local connection - ZERO internet calls!
      const peerTarget = parsePeerQr(trimmed);
      if (peerTarget) {
        await PeerExamClient.setTarget(peerTarget);

        let scheduleId = peerTarget.scheduleId;
        let roomId = peerTarget.roomId;
        let examCode = peerTarget.code;

        try {
          const resolved = await PeerExamClient.request<{
            schedule?: { id?: number; title?: string };
            session?: { id?: number; roomId?: number };
            examinationCode?: string;
            status?: string;
          }>('/resolve', {
            method: 'POST',
            body: { code: peerTarget.code },
            timeoutMs: 3500,
          });
          if (resolved.schedule?.id) scheduleId = Number(resolved.schedule.id);
          if (resolved.session?.roomId || resolved.session?.id) {
            roomId = Number(resolved.session.roomId || resolved.session.id);
          }
          if (resolved.examinationCode) examCode = resolved.examinationCode;
        } catch (lanErr: any) {
          const msg = lanErr instanceof Error ? lanErr.message : '';
          if (msg.includes('ended') || msg.includes('not the one open')) {
            throw lanErr;
          }
          const isAlive = await PeerExamClient.ping();
          if (!isAlive) {
            throw new Error(
              `Cannot reach the Proctor device at ${peerTarget.host}.\n\nPlease ensure you are connected to the official examination Wi-Fi network ("${peerTarget.wifiSsid || 'exam Wi-Fi'}") and try again.`,
            );
          }
        }

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
            if (parsed.code) code = String(parsed.code).trim().toUpperCase();
          } catch {
            // not JSON
          }
        }
        if (!token && !code) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
          if (isUuid) {
            token = trimmed;
          } else {
            code = trimmed.toUpperCase();
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

      if (cloudResolved) {
        await PeerExamClient.setTarget({
          host: cloudResolved.proctor_local_ip,
          port: cloudResolved.proctor_local_port,
          code: cloudResolved.session_code,
          scheduleId: cloudResolved.schedule_id ?? null,
          roomId: cloudResolved.room_id ?? null,
        });

        if (cloudResolved.passkey) {
          useStudentStore.getState().setExamPasskey(cloudResolved.passkey);
        }

        await LobbyRepository.persistExaminationCode(cloudResolved.session_code || code);

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
          await PeerExamClient.setTarget(discovered);

          let scheduleId = discovered.scheduleId;
          let roomId = discovered.roomId;
          let examCode = discovered.code || code;

          try {
            const resolved = await PeerExamClient.request<{
              schedule?: { id?: number; title?: string };
              session?: { id?: number; roomId?: number };
              examinationCode?: string;
            }>('/resolve', {
              method: 'POST',
              body: { code: discovered.code || code },
              timeoutMs: 3500,
            });
            if (resolved.schedule?.id) scheduleId = Number(resolved.schedule.id);
            if (resolved.session?.roomId || resolved.session?.id) {
              roomId = Number(resolved.session.roomId || resolved.session.id);
            }
            if (resolved.examinationCode) examCode = resolved.examinationCode;
          } catch {
            // keep discovered
          }

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
      throw new Error(
        'Could not locate the Proctor examination session on the local Wi-Fi.\n\nPlease scan the Proctor\'s QR code displayed on screen to join directly.',
      );
    } catch (err: any) {
      if (err?.status === 409) {
        setError('This student account has already joined this examination session from another device.');
      } else if (err?.status === 404) {
        setError('This code is no longer valid, ask your proctor for a new one.');
      } else {
        setError(err instanceof Error ? err.message : 'This code is no longer valid, ask your proctor for a new one.');
      }
      if (type === 'qr') {
        setScanning(true);
      }
    } finally {
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
      setError(err instanceof Error ? err.message : 'Unable to simulate scan.');
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

  const cameraReady = Boolean(permission?.granted);
  const title = mode === 'code' ? 'Enter Examination Code' : 'Scan QR Code';
  const intro =
    mode === 'code'
      ? 'Type the room code from your proctor if the camera is unavailable.'
      : 'Scan the proctor QR code shown in the examination room.';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamProcessChrome
        step={0}
        title={title}
        stepLabel="Step 1 of 6 · Join"
        onBack={close}
        backLabel="Cancel"
      >
        <Text style={styles.intro}>{intro}</Text>
        {modeToggle}

        {mode === 'code' ? (
          <>
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
          </>
        ) : (
          <>
            <View style={styles.qrCard}>
              <View style={styles.cameraFrame}>
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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {__DEV__ ? (
              <Pressable style={styles.devBtn} onPress={() => void simulateScan()}>
                <Text style={styles.devBtnText}>{busy ? '…' : 'Simulate scan'}</Text>
              </Pressable>
            ) : null}

            {!permission?.granted ? (
              <ExamProcessActions>
                <ExamProcessButton title="Allow Camera" onPress={requestPermission} />
              </ExamProcessActions>
            ) : busy ? (
              <ExamProcessActions>
                <ExamProcessButton title="Scanning…" loading disabled onPress={() => undefined} />
              </ExamProcessActions>
            ) : null}
          </>
        )}
      </ExamProcessChrome>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: examProcess.pageBg },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: examProcess.muted,
    marginBottom: 12,
    fontFamily: examProcess.fontRegular,
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
  qrCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: examProcess.inputBg,
    borderWidth: 1,
    borderColor: examProcess.inputBorder,
    borderRadius: examProcess.radiusControl,
    padding: 12,
  },
  cameraFrame: {
    width: FRAME,
    height: FRAME,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1410',
  },
  cameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
    backgroundColor: '#2C241C',
  },
  cameraFallbackTitle: {
    color: examProcess.white,
    fontSize: 16,
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
  },
  cameraFallbackText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontFamily: examProcess.fontRegular,
  },
  viewfinderRing: {
    ...StyleSheet.absoluteFillObject,
    margin: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  devBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: examProcess.cardElevated,
  },
  devBtnText: {
    color: examProcess.ink,
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
});
