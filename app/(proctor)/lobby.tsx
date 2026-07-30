import React, { useEffect, useState } from 'react';
import { FlatList, Text, View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  Button,
  Card,
  ConfirmationModal,
  Header,
  Loader,
  QrCodePanel,
  StatusChip,
  StatisticCard,
} from '@/components/ui';
import { LobbyStudentCard } from '@/features/proctor/LobbyStudentCard';
import { useLobby } from '@/hooks/useRepositories';
import { LobbyRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useLobbyStore } from '@/stores';
import { colors } from '@/theme';
import { Copy, Users, UserCheck, UserX } from 'lucide-react-native';

export default function ProctorLobbyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const lobbyQuery = useLobby(sessionId);

  useEffect(() => {
    async function open() {
      if (!sessionId) return;
      const snapshot = await LobbyRepository.seedDemoStudents(sessionId);
      setSnapshot(snapshot);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lobby(sessionId) });
      setReady(true);
    }
    void open();
  }, [sessionId, setSnapshot, queryClient]);

  useEffect(() => {
    if (lobbyQuery.data) setSnapshot(lobbyQuery.data);
  }, [lobbyQuery.data, setSnapshot]);

  const lobby = lobbyQuery.data;

  if (!ready || !lobby) {
    return <Loader fullscreen label="Opening examination lobby…" />;
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lobby(sessionId) });
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(lobby.examinationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Examination Code', lobby.examinationCode);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Lobby"
        subtitle={lobby.session.batchNumber}
        onBack={() => router.back()}
      />

      <FlatList
        data={lobby.students}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Card>
              <View style={styles.examHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examName}>{lobby.schedule.name}</Text>
                  <Text style={styles.line}>School Year: {lobby.schedule.schoolYear}</Text>
                  <Text style={styles.line}>Date: {lobby.schedule.examinationDate}</Text>
                  <Text style={styles.line}>Time: {lobby.session.timeLabel}</Text>
                  <Text style={styles.line}>Venue: {lobby.session.venue}</Text>
                  <Text style={styles.line}>Batch: {lobby.session.batchNumber}</Text>
                  <Text style={styles.line}>
                    Total Registered Students: {lobby.registeredCount}
                  </Text>
                </View>
                <StatusChip status={lobby.status} />
              </View>
            </Card>

            <Card delay={40}>
              <QrCodePanel
                value={lobby.qrValue}
                note="Students must scan this QR Code to join the examination."
              />
              <View style={styles.codeBlock}>
                <Text style={styles.codeLabel}>Examination Code</Text>
                <Text style={styles.codeValue}>{lobby.examinationCode}</Text>
              </View>
            </Card>

            <View style={styles.actions}>
              <Button
                title="Regenerate QR Code"
                variant="outline"
                fullWidth
                loading={busy}
                onPress={async () => {
                  if (!sessionId) return;
                  setBusy(true);
                  const snapshot = await LobbyRepository.regenerateQr(sessionId);
                  setSnapshot(snapshot);
                  await refresh();
                  setBusy(false);
                }}
              />
              <Button
                title={copied ? 'Copied!' : 'Copy Examination Code'}
                variant="outline"
                fullWidth
                icon={<Copy size={16} color={colors.primary} />}
                onPress={copyCode}
              />
              <Button
                title="Start Examination"
                size="lg"
                fullWidth
                onPress={() => setStartOpen(true)}
                disabled={lobby.status === 'in_progress' || lobby.status === 'ended'}
              />
            </View>

            <View style={styles.statsRow}>
              <StatisticCard
                label="Registered"
                value={lobby.registeredCount}
                tone="default"
                icon={<Users size={18} color={colors.primary} />}
              />
              <StatisticCard
                label="Connected"
                value={lobby.connectedCount}
                tone="info"
                icon={<UserCheck size={18} color={colors.info} />}
                delay={40}
              />
            </View>
            <StatisticCard
              label="Not Yet Connected"
              value={lobby.notYetConnectedCount}
              tone="warning"
              icon={<UserX size={18} color={colors.warning} />}
              delay={80}
            />

            <Text style={styles.section}>Connected Students</Text>
            <Text style={styles.sectionHint}>
              {lobby.connectedCount} of {lobby.registeredCount} registered students have joined
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <LobbyStudentCard student={item} delay={Math.min(index * 40, 200)} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No students have joined yet. Share the QR Code or exam code.</Text>
        }
      />

      <ConfirmationModal
        visible={startOpen}
        title="Start Examination?"
        description="Connected and waiting students will move to Taking Examination status."
        confirmLabel="Yes, start"
        cancelLabel="No"
        loading={busy}
        onCancel={() => setStartOpen(false)}
        onConfirm={async () => {
          if (!sessionId) return;
          setBusy(true);
          const snapshot = await LobbyRepository.startExamination(sessionId);
          setSnapshot(snapshot);
          await refresh();
          setBusy(false);
          setStartOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  headerBlock: { gap: 14, marginBottom: 8 },
  examHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  examName: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  line: { fontSize: 13, color: colors.inkSecondary, marginBottom: 4, fontWeight: '500' },
  codeBlock: {
    marginTop: 16,
    alignItems: 'center',
    gap: 6,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  actions: { gap: 10 },
  statsRow: { flexDirection: 'row', gap: 12 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  sectionHint: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', marginTop: -6 },
  empty: {
    textAlign: 'center',
    color: colors.inkMuted,
    fontSize: 13,
    paddingVertical: 20,
  },
});
