import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Header, Button, Card, Skeleton, SkeletonText } from '@/components/ui';
import { CampusWifiBlockedCard } from '@/features/student/CampusWifiBlockedCard';
import { useCampusWifiJoinGate } from '@/hooks/useCampusWifiJoinGate';
import { LobbyRepository, ScheduleRepository } from '@/repositories';
import { useStudentStore, useLobbyStore } from '@/stores';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { colors } from '@/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wifiBlocked, setWifiBlocked] = useState(false);
  const setScannedSession = useStudentStore((s) => s.setScannedSession);
  const wifiGate = useCampusWifiJoinGate({ requireServer: true });
  const lastScanAt = useRef(0);

  const handlePayload = async (raw: string) => {
    if (busy) return;
    const now = Date.now();
    if (now - lastScanAt.current < 1500) return;
    lastScanAt.current = now;

    setBusy(true);
    setScanning(false);
    setError(null);

    // Verdict comes right after the scan: does this phone's Wi‑Fi reach the proctor?
    const gate = await wifiGate.refresh(raw);
    if (!gate.ok) {
      setError(gate.message ?? 'Wi‑Fi / LAN does not match the proctor network.');
      setWifiBlocked(true);
      setBusy(false);
      return;
    }

    const resolved = await ScheduleRepository.resolveSessionFromQr(raw);
    if (!resolved.valid || !resolved.session || !resolved.schedule || resolved.session.status === 'ended') {
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

    // PROBLEM 2 FIX: Clear old student verification & participation tokens when scanning a new QR code
    useStudentStore.getState().setVerifiedStudent(null);
    useStudentStore.getState().setSelectedStudent(null);
    useStudentStore.getState().setExamPasskey(null);
    useLobbyStore.getState().setSnapshot(null);
    await appStorage.deleteItem(STORAGE_KEYS.participationToken);
    await appStorage.deleteItem(STORAGE_KEYS.studentProgress);

    setScannedSession(resolved.schedule.id, resolved.session.id);
    router.replace('/(student)/passkey');
  };

  /** Dev helper: reuse a stored exam code, otherwise send user to manual entry. */
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
      router.replace('/(student)/enter-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to simulate scan.');
      setBusy(false);
      setScanning(true);
    }
  };

  if (!permission) {
    return (
      <View style={styles.screen}>
        <Header title="Scan QR Code" subtitle="Checking camera permission…" />
        <View style={styles.permission}>
          <Skeleton height={280} radius={20} />
          <SkeletonText lines={2} />
          <Skeleton height={52} radius={14} />
        </View>
      </View>
    );
  }

  // The Wi‑Fi verdict is delivered when the QR is scanned (handlePayload re-checks),
  // so the camera stays available instead of being blocked before the applicant scans.
  if (wifiBlocked) {
    return (
      <View style={styles.screen}>
        <Header title="Scan QR Code" onBack={() => router.back()} />
        <View style={styles.permission}>
          <CampusWifiBlockedCard
            title="Different examination network"
            message={
              error ??
              wifiGate.message ??
              'You are connected to a different examination network. Please connect to the same Wi‑Fi network as the proctor and scan again.'
            }
            checking={wifiGate.checking}
            onRetry={() => {
              setWifiBlocked(false);
              setError(null);
              setScanning(true);
              setBusy(false);
            }}
          />
          <Button
            title="Scan Again"
            fullWidth
            onPress={() => {
              setWifiBlocked(false);
              setError(null);
              setScanning(true);
              setBusy(false);
            }}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Enter Examination Code"
            variant="outline"
            fullWidth
            onPress={() => router.replace('/(student)/enter-code')}
            style={{ marginTop: 8 }}
          />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <Header title="Scan QR Code" onBack={() => router.back()} />
        <View style={styles.permission}>
          <Card>
            <Text style={styles.title}>Camera access required</Text>
            <Text style={styles.body}>
              Allow camera access to scan the examination QR Code, or enter the code manually.
            </Text>
            <Button title="Allow Camera" fullWidth onPress={requestPermission} />
            <Button
              title="Enter Examination Code"
              variant="ghost"
              fullWidth
              onPress={() => router.replace('/(student)/enter-code')}
              style={{ marginTop: 8 }}
            />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="Scan QR Code" subtitle="Point at the proctor QR" onBack={() => router.back()} />
      <View style={styles.cameraWrap}>
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
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Align the QR Code inside the frame</Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}>
        <Button
          title="Enter Examination Code Instead"
          variant="outline"
          fullWidth
          onPress={() => router.replace('/(student)/enter-code')}
        />
        {__DEV__ ? (
          <Button
            title="Simulate Successful Scan"
            variant="ghost"
            fullWidth
            loading={busy}
            onPress={simulateScan}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  permission: { flex: 1, justifyContent: 'center', padding: 20, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 16 },
  cameraWrap: {
    flex: 1,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.secondary,
    backgroundColor: 'transparent',
  },
  hint: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  footer: { padding: 20, paddingTop: 0 },
});
