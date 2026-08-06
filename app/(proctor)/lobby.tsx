import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  Button,
  Card,
  ConfirmationModal,
  Header,
  QrCodePanel,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonText,
  StatusChip,
  StatisticCard,
} from '@/components/ui';
import { LobbyStudentCard } from '@/features/proctor/LobbyStudentCard';
import { useLobby } from '@/hooks/useRepositories';
import { LobbyRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { PeerExamServer } from '@/services/peerExamServer';
import { useLobbyStore, useProctorStore } from '@/stores';
import { colors } from '@/theme';
import type { LobbyStudent } from '@/types';
import { safeBack } from '@/utils';
import {
  // keep existing imports below — do not break the rest of this file
  Copy,
  Users,
  UserCheck,
  UserX,
  Play,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react-native';

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ProctorLobbyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sessionId, roomId, examSessionId } = useLocalSearchParams<{
    sessionId: string;
    roomId?: string;
    examSessionId?: string;
  }>();
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const storeLobby = useLobbyStore((s) => s.snapshot);
  const selectedSchedule = useProctorStore((s) => s.selectedSchedule);
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<LobbyStudent | null>(null);
  const [syncPending, setSyncPending] = useState<number | null>(null);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const knownStudentIds = useRef<Set<string>>(new Set());
  const knownStudentMeta = useRef<Map<string, LobbyStudent>>(new Map());
  const knownStudentStatus = useRef<Map<string, LobbyStudent['status']>>(new Map());
  const checkInReady = useRef(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; at: string; kind: 'connect' | 'disconnect' }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [reconnectCode, setReconnectCode] = useState<string | null>(null);
  const [reconnectExpiresAt, setReconnectExpiresAt] = useState<string | null>(null);
  const [peerHost, setPeerHost] = useState<string | null>(null);
  const [hosting, setHosting] = useState(PeerExamServer.info());

  const lobbyQuery = useLobby(
    ready && !openError ? sessionId : undefined,
    roomId,
  );

  const pushNotification = (
    kind: 'connect' | 'disconnect',
    title: string,
    body: string,
  ) => {
    const at = new Date().toISOString();
    setNotifications((prev) =>
      [{ id: `${kind}-${at}-${Math.random().toString(36).slice(2, 7)}`, title, body, at, kind }, ...prev].slice(
        0,
        40,
      ),
    );
    Alert.alert(title, body);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) return;
      setOpenError(null);
      setReady(false);
      setSnapshot(null);
      knownStudentIds.current = new Set();
      checkInReady.current = false;
      try {
        // Resume a peer session that survived an app kill, then load the lobby.
        await PeerExamServer.restore();
        const snapshot = await LobbyRepository.fetchProctorLobby(
          sessionId,
          roomId,
          examSessionId,
        );
        if (cancelled) return;
        if (!snapshot) {
          setOpenError(
            'This room lobby is not available. Go back and open the lobby, or view results if the exam already ended.',
          );
          return;
        }
        knownStudentIds.current = new Set(snapshot.students.map((s) => s.id));
        knownStudentMeta.current = new Map(snapshot.students.map((s) => [s.id, s]));
        knownStudentStatus.current = new Map(
          snapshot.students.map((s) => [s.id, s.status]),
        );
        checkInReady.current = true;
        setSnapshot(snapshot);
        setPeerHost(PeerExamServer.info().host);
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.lobby(sessionId, roomId),
        });
      } catch (error) {
        if (cancelled) return;
        setOpenError(
          error instanceof Error ? error.message : 'Unable to load examination lobby.',
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, roomId, examSessionId, setSnapshot, queryClient]);

  // Peer mode: push updates instantly when a student joins / answers / violates.
  useEffect(() => {
    return PeerExamServer.subscribe(() => {
      setPeerHost(PeerExamServer.info().host);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.lobby(sessionId, roomId),
      });
    });
  }, [queryClient, sessionId, roomId]);

  useEffect(() => {
    if (lobbyQuery.data) {
      setSnapshot(lobbyQuery.data);
      if (selected) {
        const latest = lobbyQuery.data.students.find((s) => s.id === selected.id) ?? null;
        setSelected(latest);
        if (latest?.status === 'disconnected') {
          setReconnectCode(latest.reconnectCode ?? null);
          setReconnectExpiresAt(latest.reconnectCodeExpiresAt ?? null);
        } else {
          setReconnectCode(null);
          setReconnectExpiresAt(null);
        }
      }

      // Real-time connect / disconnect notifications (LAN poll — no internet required).
      if (checkInReady.current) {
        const currentIds = new Set(lobbyQuery.data.students.map((s) => s.id));

        const newcomers = lobbyQuery.data.students.filter(
          (s) => !knownStudentIds.current.has(s.id),
        );
        newcomers.forEach((student) => {
          knownStudentIds.current.add(student.id);
          knownStudentMeta.current.set(student.id, student);
          knownStudentStatus.current.set(student.id, student.status);
          const timeLabel = formatTime(student.joinedAt || new Date().toISOString());
          const statusLabel =
            student.status === 'waiting'
              ? 'Waiting'
              : student.status === 'connected'
                ? 'Connected'
                : student.status === 'taking_exam'
                  ? 'Taking'
                  : student.status === 'disconnected'
                    ? 'Disconnected'
                    : student.status === 'finished'
                      ? 'Done'
                      : student.status.replace(/_/g, ' ');
          pushNotification(
            'connect',
            'Student Connected',
            `${student.fullName} connected to the examination system at ${timeLabel}. Status: ${statusLabel}.`,
          );
        });

        const leftIds = [...knownStudentIds.current].filter((id) => !currentIds.has(id));
        leftIds.forEach((id) => {
          const prev = knownStudentMeta.current.get(id);
          knownStudentIds.current.delete(id);
          knownStudentMeta.current.delete(id);
          knownStudentStatus.current.delete(id);
          const name = prev?.fullName || 'A student';
          const timeLabel = formatTime(new Date().toISOString());
          pushNotification(
            'disconnect',
            'Student Disconnected',
            `${name} left the examination lobby at ${timeLabel}.`,
          );
        });

        lobbyQuery.data.students.forEach((s) => {
          const prevStatus = knownStudentStatus.current.get(s.id);
          if (
            prevStatus &&
            prevStatus !== 'disconnected' &&
            s.status === 'disconnected'
          ) {
            const timeLabel = formatTime(new Date().toISOString());
            pushNotification(
              'disconnect',
              'Student Disconnected',
              `${s.fullName} lost Wi‑Fi or stopped heartbeating at ${timeLabel}. Issue a reconnect code if the reason is valid.`,
            );
          }
          if (
            prevStatus === 'disconnected' &&
            s.status === 'taking_exam'
          ) {
            pushNotification(
              'connect',
              'Student Reconnected',
              `${s.fullName} reconnected and is taking the examination again.`,
            );
          }
          knownStudentIds.current.add(s.id);
          knownStudentMeta.current.set(s.id, s);
          knownStudentStatus.current.set(s.id, s.status);
        });
      } else if (lobbyQuery.data.students.length) {
        lobbyQuery.data.students.forEach((s) => {
          knownStudentIds.current.add(s.id);
          knownStudentMeta.current.set(s.id, s);
          knownStudentStatus.current.set(s.id, s.status);
        });
      }
    }
  }, [lobbyQuery.data, setSnapshot, selected]);

  const lobby = lobbyQuery.data ?? storeLobby;

  useEffect(() => {
    if (!lobby?.status || lobby.status !== 'ended') return;
    const examSessionId = lobby.session?.examSessionId;
    if (!examSessionId) return;
    let cancelled = false;
    void LobbyRepository.syncPendingCount(examSessionId)
      .then((info) => {
        if (cancelled) return;
        setSyncPending(info.pending);
        setSyncConfigured(info.configured);
      })
      .catch(() => {
        if (!cancelled) setSyncPending(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lobby?.status, lobby?.session?.examSessionId, lobby?.finishedCount]);

  const goBack = () => {
    if (sessionId && roomId) {
      safeBack(router, {
        pathname: '/(proctor)/room',
        params: { sessionId, roomId },
      });
      return;
    }
    if (sessionId) {
      safeBack(router, {
        pathname: '/(proctor)/rooms',
        params: { sessionId },
      });
      return;
    }
    const scheduleId =
      lobby?.session?.scheduleId ?? selectedSchedule?.id ?? undefined;
    safeBack(
      router,
      scheduleId
        ? { pathname: '/(proctor)/sessions', params: { scheduleId } }
        : '/(proctor)/schedules',
    );
  };

  if (!ready) {
    return (
      <View style={styles.screen}>
        <Header title="Examination Lobby" subtitle="Loading…" onBack={goBack} />
        <View style={styles.lobbySkeleton}>
          <SkeletonCard>
            <Skeleton height={16} width="50%" />
            <SkeletonText lines={2} />
            <Skeleton height={180} radius={16} />
          </SkeletonCard>
          <SkeletonList rows={4} />
        </View>
      </View>
    );
  }

  if (openError || !lobby) {
    return (
      <View style={styles.screen}>
        <Header title="Examination Lobby" onBack={goBack} />
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Lobby not available</Text>
          <Text style={styles.errorBody}>
            {openError || 'No examination session is available for this room.'}
          </Text>
          <Button
            title="Back to room"
            fullWidth
            onPress={goBack}
          />
        </View>
      </View>
    );
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.lobby(sessionId, roomId),
    });
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(lobby.examinationCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Examination Code', lobby.examinationCode ?? '');
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Lobby"
        subtitle={
          lobby.session.roomName
            ? `${lobby.session.roomName} · ${lobby.session.batchNumber}`
            : lobby.session.batchNumber
        }
        onBack={goBack}
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
                  <Text style={styles.line}>
                    Room: {lobby.session.roomName || lobby.session.venue}
                  </Text>
                  {lobby.proctor_name ? (
                    <Text style={styles.line}>Proctored by: {lobby.proctor_name}</Text>
                  ) : null}
                  <Text style={styles.line}>Batch: {lobby.session.batchNumber}</Text>
                  <Text style={styles.line}>
                    Total Registered Students: {lobby.registeredCount}
                  </Text>
                </View>
                <StatusChip status={lobby.status} />
              </View>
            </Card>

            <Card delay={40}>
              {peerHost ? (
                <View style={styles.peerBanner}>
                  <Text style={styles.peerTitle}>Hosting on this phone</Text>
                  <Text style={styles.peerBody}>
                    Students join over Wi‑Fi at {peerHost}. Keep this screen open —
                    Laravel does not need to be running.
                  </Text>
                </View>
              ) : null}
              <QrCodePanel
                value={lobby.qrValue}
                note={
                  lobby.status === 'in_progress'
                    ? 'Examination in progress. New QR scans are blocked.'
                    : peerHost
                      ? `Students scan this QR to reach THIS phone (${peerHost}). Same Wi‑Fi required — no Laravel.`
                      : `Room-specific QR for ${lobby.roomName || lobby.session.roomName || lobby.session.venue}. Other rooms have different codes.`
                }
              />
              <View style={styles.codeBlock}>
                <Text style={styles.codeLabel}>
                  Examination Code · {lobby.roomName || lobby.session.roomName || 'This room'}
                </Text>
                <Text style={styles.codeValue}>{lobby.examinationCode}</Text>
                <Text style={styles.codeHint}>
                  {peerHost
                    ? 'Unique to this room. The QR also carries this phone’s Wi‑Fi address.'
                    : 'Unique to this room. Students in another room need that room’s code/QR.'}
                </Text>
              </View>
            </Card>

            <View style={styles.actions}>
              <Button
                title="Regenerate QR Code"
                variant="outline"
                fullWidth
                loading={busy}
                disabled={lobby.can_control === false || lobby.status === 'ended' || lobby.status === 'in_progress'}
                onPress={async () => {
                  if (!sessionId) return;
                  if (lobby.can_control === false) {
                    Alert.alert(
                      'Not allowed',
                      'Only the proctor who opened this lobby can regenerate the code.',
                    );
                    return;
                  }
                  setBusy(true);
                  try {
                    const snapshot = await LobbyRepository.regenerateQr(
                      sessionId,
                      roomId,
                    );
                    setSnapshot(snapshot);
                    await refresh();
                  } catch (error) {
                    Alert.alert(
                      'Unable to regenerate',
                      error instanceof Error ? error.message : 'Please try again.',
                    );
                  } finally {
                    setBusy(false);
                  }
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
                onPress={() => {
                  if (lobby.can_control === false) {
                    Alert.alert(
                      'Not allowed',
                      'Only the proctor who opened this lobby can start the examination.',
                    );
                    return;
                  }
                  setStartOpen(true);
                }}
                disabled={
                  lobby.can_control === false ||
                  lobby.status === 'in_progress' ||
                  lobby.status === 'ended'
                }
              />
              {lobby.status === 'in_progress' ? (
                <Button
                  title="End Examination"
                  variant="danger"
                  size="lg"
                  fullWidth
                  disabled={lobby.can_control === false}
                  onPress={() => {
                    if (lobby.can_control === false) {
                      Alert.alert(
                        'Not allowed',
                        'Only the proctor who opened this lobby can end the examination.',
                      );
                      return;
                    }
                    setEndOpen(true);
                  }}
                />
              ) : null}
              {lobby.status === 'ended' ? (
                <Button
                  title={
                    syncPending != null && syncPending > 0
                      ? `Sync results to Admin (${syncPending})`
                      : syncPending === 0
                        ? 'Results synced to Admin'
                        : 'Sync results to Admin'
                  }
                  size="lg"
                  fullWidth
                  loading={busy}
                  disabled={busy || syncPending === 0}
                  onPress={async () => {
                    const examSessionId = lobby.session?.examSessionId;
                    if (!examSessionId) {
                      Alert.alert('Unable to sync', 'Examination session not found.');
                      return;
                    }
                    setBusy(true);
                    try {
                      const result = await LobbyRepository.syncToAdmin(examSessionId);
                      const info = await LobbyRepository.syncPendingCount(examSessionId);
                      setSyncPending(info.pending);
                      setSyncConfigured(info.configured);
                      Alert.alert(
                        result.failed > 0 ? 'Sync partially complete' : 'Synced',
                        result.message,
                      );
                    } catch (error) {
                      Alert.alert(
                        'Sync failed',
                        error instanceof Error
                          ? error.message
                          : 'Connect to the internet and try again.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ) : null}
              {lobby.status === 'ended' && syncConfigured === false ? (
                <Text style={styles.ownerHint}>
                  Set ADMIN_SYNC_URL and ADMIN_SYNC_TOKEN on the LAN server, then restart Laravel.
                </Text>
              ) : null}
              {lobby.status === 'ended' && syncConfigured ? (
                <Text style={styles.ownerHint}>
                  You can leave and return later via View results & sync if you forget to sync now.
                </Text>
              ) : null}
              {lobby.can_control === false ? (
                <Text style={styles.ownerHint}>
                  Viewing only — opened by {lobby.proctor_name || 'another proctor'}.
                </Text>
              ) : null}
            </View>

            {lobby.status === 'in_progress' ? (
              <Card>
                <Text style={styles.monitorTitle}>Live monitoring</Text>
                <Text style={styles.monitorLine}>
                  Remaining time:{' '}
                  {formatRemaining(
                    lobby.session.remainingSeconds ?? lobby.remainingSeconds ?? null,
                  )}
                </Text>
                <Text style={styles.monitorLine}>
                  Taking: {lobby.takingCount} · Disconnected:{' '}
                  {lobby.disconnectedCount ?? 0} · Done: {lobby.finishedCount}
                </Text>
              </Card>
            ) : null}

            <Text style={styles.section}>Security Monitoring</Text>
            <Text style={styles.sectionHint}>
              Waiting = scanned QR, selected name, waiting for you to start. Taking = exam in
              progress.
            </Text>
            <View style={styles.statsGrid}>
              <StatisticCard
                label="Registered"
                value={lobby.registeredCount}
                hint="On this schedule"
                icon={<Users size={18} color={colors.primary} />}
              />
              <StatisticCard
                label="Waiting"
                value={lobby.waitingCount}
                tone="warning"
                hint="Scanned · wait to start"
                icon={<UserCheck size={18} color={colors.warning} />}
                delay={40}
              />
              <StatisticCard
                label="Not joined"
                value={lobby.notYetConnectedCount}
                tone="info"
                hint="Have not scanned yet"
                icon={<UserX size={18} color={colors.info} />}
                delay={80}
              />
              <StatisticCard
                label="Taking"
                value={lobby.takingCount}
                tone="default"
                hint="Exam started"
                icon={<Play size={18} color={colors.primary} />}
              />
              <StatisticCard
                label="Disconnected"
                value={lobby.disconnectedCount ?? 0}
                tone="warning"
                hint="Need reconnect code"
                icon={<UserX size={18} color={colors.danger} />}
                delay={40}
              />
              <StatisticCard
                label="Done"
                value={lobby.finishedCount}
                tone="success"
                hint="Submitted"
                icon={<CheckCircle2 size={18} color={colors.success} />}
                delay={80}
              />
              <StatisticCard
                label="Violations"
                value={lobby.violationsDetected}
                tone="warning"
                hint="Security flags"
                icon={<ShieldAlert size={18} color={colors.danger} />}
              />
            </View>

            <Text style={styles.section}>Students in this room</Text>
            <Text style={styles.sectionHint}>
              {lobby.waitingCount} waiting to start · {lobby.takingCount} taking ·{' '}
              {lobby.connectedCount} joined of {lobby.registeredCount} registered. Tap a student
              for details. Disconnected students show a 6-digit reconnect PIN (not the exam code).
            </Text>

            {(lobby.recentViolations?.length ?? 0) > 0 ? (
              <Card>
                <Text style={styles.historyTitle}>Security violations</Text>
                {(lobby.recentViolations ?? []).slice(0, 8).map((v) => (
                  <View key={String(v.id)} style={styles.historyRow}>
                    <Text style={[styles.historyKind, styles.historyDisconnect]}>
                      {String(v.type).replace(/_/g, ' ')}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyBody}>
                        {v.studentName}: {v.message || v.type}
                      </Text>
                      <Text style={styles.historyTime}>
                        {formatTime(v.occurredAt)} · warning #{v.violationCount}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <Button
              title={
                showHistory
                  ? 'Hide connection history'
                  : `Connection history (${notifications.length})`
              }
              variant="ghost"
              fullWidth
              onPress={() => setShowHistory((v) => !v)}
            />
            {showHistory ? (
              <Card>
                <Text style={styles.historyTitle}>Live connection log</Text>
                {notifications.length === 0 ? (
                  <Text style={styles.historyEmpty}>No connection events yet.</Text>
                ) : (
                  notifications.slice(0, 12).map((n) => (
                    <View key={n.id} style={styles.historyRow}>
                      <Text
                        style={[
                          styles.historyKind,
                          n.kind === 'disconnect' ? styles.historyDisconnect : null,
                        ]}
                      >
                        {n.kind === 'connect' ? 'Connected' : 'Left'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyBody}>{n.body}</Text>
                        <Text style={styles.historyTime}>{formatTime(n.at)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <LobbyStudentCard
            student={item}
            delay={Math.min(index * 40, 200)}
            onPress={() => {
              setSelected(item);
              setReconnectCode(item.reconnectCode ?? null);
              setReconnectExpiresAt(item.reconnectCodeExpiresAt ?? null);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No students have joined yet. Share the QR Code or exam code.
          </Text>
        }
      />

      <ConfirmationModal
        visible={startOpen}
        title="Start Examination?"
        description="Students who already scanned the QR and selected their name (Waiting) will move to Taking. Exam Security Mode activates on student devices. New QR scans will be blocked."
        confirmLabel="Yes, start"
        cancelLabel="No"
        loading={busy}
        onCancel={() => setStartOpen(false)}
        onConfirm={async () => {
          if (!sessionId) return;
          setBusy(true);
          try {
            const snapshot = await LobbyRepository.startExamination(
              sessionId,
              roomId,
            );
            setSnapshot(snapshot);
            await refresh();
            setStartOpen(false);
          } catch (error) {
            Alert.alert(
              'Unable to start',
              error instanceof Error ? error.message : 'Please try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />

      <ConfirmationModal
        visible={endOpen}
        title="End Examination?"
        description="This immediately ends the exam, auto-submits every student still taking it, and closes the session. This cannot be undone."
        confirmLabel="Yes, end now"
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setEndOpen(false)}
        onConfirm={async () => {
          if (!sessionId) return;
          setBusy(true);
          try {
            const snapshot = await LobbyRepository.endExamination(sessionId, roomId);
            setSnapshot(snapshot);
            await refresh();
            setEndOpen(false);
            Alert.alert('Examination ended', 'All active examinees were submitted and the session is closed.');
          } catch (error) {
            Alert.alert(
              'Unable to end',
              error instanceof Error ? error.message : 'Please try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSelected(null);
          setReconnectCode(null);
          setReconnectExpiresAt(null);
        }}
      >
        <View style={styles.detailOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setSelected(null);
              setReconnectCode(null);
              setReconnectExpiresAt(null);
            }}
          />
          {selected ? (
            <View style={styles.detailSheet}>
              <Text style={styles.detailTitle}>{selected.fullName}</Text>
              <StatusChip status={selected.status} />
              <DetailRow label="Gmail" value={selected.email} />
              <DetailRow label="Desired Program" value={selected.programName} />
              <DetailRow
                label="Current Status"
                value={
                  selected.status === 'taking_exam'
                    ? 'Taking'
                    : selected.status === 'disconnected'
                      ? 'Disconnected'
                      : selected.status === 'finished'
                        ? 'Done'
                        : selected.status.replace('_', ' ')
                }
              />
              <DetailRow label="Number of Violations" value={String(selected.violationCount)} />
              <DetailRow label="Time Connected" value={formatTime(selected.joinedAt)} />
              <DetailRow label="Time Started" value={formatTime(selected.startedAt)} />
              <DetailRow label="Last Activity" value={formatTime(selected.lastActivityAt)} />
              {selected.terminationReason ? (
                <DetailRow label="Termination" value={selected.terminationReason.replace('_', ' ')} />
              ) : null}

              {selected.status === 'disconnected' ? (
                <View style={styles.reconnectBox}>
                  <Text style={styles.reconnectLabel}>Reconnect PIN (tell the student)</Text>
                  <Text style={styles.reconnectCode}>
                    {reconnectCode || selected.reconnectCode || '————'}
                  </Text>
                  <Text style={styles.reconnectHint}>
                    6-digit PIN only — never the examination / QR code. Student enters it on the
                    lock screen after Wi‑Fi is back.
                    {(reconnectExpiresAt || selected.reconnectCodeExpiresAt)
                      ? ` Expires ${formatTime(reconnectExpiresAt || selected.reconnectCodeExpiresAt)}.`
                      : ''}
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailActions}>
                {selected.status === 'disconnected' ? (
                  <Button
                    title="Issue new reconnect PIN"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        const result = await LobbyRepository.allowStudentReconnect(selected.id);
                        setReconnectCode(result.reconnectCode);
                        setReconnectExpiresAt(result.expiresAt);
                        await refresh();
                      } catch (error) {
                        Alert.alert(
                          'Reconnect failed',
                          error instanceof Error ? error.message : 'Unable to issue code.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ) : null}
                {selected.status === 'warning' ? (
                  <Button
                    title="Continue Exam"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      await LobbyRepository.resumeStudent(selected.id);
                      await refresh();
                      setBusy(false);
                      setSelected(null);
                      setReconnectCode(null);
                    }}
                  />
                ) : null}
                {selected.status === 'warning' ||
                selected.status === 'taking_exam' ||
                selected.status === 'disconnected' ? (
                  <Button
                    title="Terminate Examination"
                    variant="danger"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      await LobbyRepository.terminateStudent(selected.id);
                      await refresh();
                      setBusy(false);
                      setSelected(null);
                      setReconnectCode(null);
                    }}
                  />
                ) : null}
                <Button
                  title="Close"
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    setSelected(null);
                    setReconnectCode(null);
                    setReconnectExpiresAt(null);
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  lobbySkeleton: { padding: 20, gap: 12 },
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
  codeHint: {
    fontSize: 12,
    color: colors.inkSecondary,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  peerBanner: {
    gap: 4,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: colors.success,
  },
  peerTitle: { fontSize: 14, fontWeight: '800', color: colors.success },
  peerBody: { fontSize: 12, lineHeight: 18, color: colors.inkSecondary, fontWeight: '500' },
  monitorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  monitorLine: {
    fontSize: 14,
    color: colors.inkSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  ownerHint: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  actions: { gap: 10 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'stretch',
  },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  sectionHint: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', marginTop: -6 },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  historyEmpty: { fontSize: 13, color: colors.inkMuted, fontWeight: '500' },
  historyRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyKind: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    width: 72,
    marginTop: 2,
  },
  historyDisconnect: { color: colors.danger },
  historyBody: { fontSize: 13, color: colors.ink, fontWeight: '600', lineHeight: 18 },
  historyTime: { fontSize: 11, color: colors.inkMuted, marginTop: 2, fontWeight: '500' },
  empty: {
    textAlign: 'center',
    color: colors.inkMuted,
    fontSize: 13,
    paddingVertical: 20,
  },
  errorWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  errorBody: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 21,
    marginBottom: 8,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 10,
    maxHeight: '85%',
  },
  detailTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, flex: 1 },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    flex: 1.4,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  reconnectBox: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    gap: 6,
  },
  reconnectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  reconnectCode: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 4,
  },
  reconnectHint: {
    fontSize: 12,
    color: colors.inkSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  detailActions: { gap: 10, marginTop: 8 },
});
