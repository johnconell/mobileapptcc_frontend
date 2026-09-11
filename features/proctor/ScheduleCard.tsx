import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  Animated,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { CheckCircle2, ChevronDown, ChevronRight, Clock } from 'lucide-react-native';
import type { ExamSchedule, ExamSession } from '@/types';
import { colors, shadows } from '@/theme';
import { Card } from '@/components/ui';
import { useSessions } from '@/hooks/useRepositories';
import { useFocusEffect } from 'expo-router';
import {
  deriveExamSlotStatus,
  examWindowHint,
  examWindowHintLabel,
  EXAM_STATUS_HINTS,
  EXAM_STATUS_LABELS,
  matchOpenedRoom,
  summarizeScheduleStatus,
  type ExamSlotVisualStatus,
} from '@/utils/examScheduleStatus';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ScheduleCardProps {
  schedule: ExamSchedule;
  onPress?: () => void;
  isExpanded?: boolean;
  onToggle?: () => void;
  onSelectTimeSlot?: (session: ExamSession) => void;
  delay?: number;
  openedRooms?: Record<string, { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }>;
}

export function ScheduleCard({
  schedule,
  onPress,
  isExpanded = false,
  onToggle,
  onSelectTimeSlot,
  delay = 0,
  openedRooms,
}: ScheduleCardProps) {
  const sessionsQuery = useSessions(schedule.id);
  const [headerPressed, setHeaderPressed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    React.useCallback(() => {
      setNow(new Date());
      const id = setInterval(() => setNow(new Date()), 15000);
      return () => clearInterval(id);
    }, []),
  );

  // Animated rotation for the dropdown chevron
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const parseDate = (d: string) => {
    if (!d) return null;
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const p = new Date(d);
    return isNaN(p.getTime()) ? null : p;
  };

  const parsed = parseDate(schedule.examinationDateIso || schedule.examinationDate);
  const day = parsed ? String(parsed.getDate()) : '--';
  const monthNames = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const month = parsed ? monthNames[parsed.getMonth()] : '---';

  const formattedDate = parsed
    ? parsed.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : schedule.examinationDate;

  const cleanName =
    schedule.name.replace(/Entrance\s+Examination/gi, '').trim() ||
    schedule.name ||
    'General Examination';

  const handleHeaderPress = () => {
    if (onToggle) {
      onToggle();
    } else if (onPress) {
      onPress();
    }
  };

  const sessionCount = sessionsQuery.data?.length ?? schedule.batchCount;
  const dateIso = schedule.examinationDateIso || schedule.examinationDate;

  const openedStatusForSession = (session: ExamSession) =>
    matchOpenedRoom(openedRooms, session)?.status ?? null;

  const slotStatus = (session: ExamSession): ExamSlotVisualStatus =>
    deriveExamSlotStatus({
      openedStatus: openedStatusForSession(session),
    });

  const sessions = sessionsQuery.data ?? [];
  const headerStatus: ExamSlotVisualStatus = sessions.length
    ? summarizeScheduleStatus(sessions.map((session) => slotStatus(session)))
    : 'not_opened';
  const windowHint = examWindowHintLabel(
    examWindowHint({
      dateIso,
      timeLabel: schedule.timeLabel,
      now,
    }),
  );

  return (
    <Card delay={delay} style={{ ...styles.card, ...(isExpanded ? styles.cardExpanded : {}) }}>
      {/* SCHEDULE CARD HEADER (Expandable trigger) */}
      <Pressable
        onPress={handleHeaderPress}
        onPressIn={() => setHeaderPressed(true)}
        onPressOut={() => setHeaderPressed(false)}
      >
        <View style={[styles.headerRow, headerPressed && styles.headerPressed]}>
          {/* Calendar Date Block (Fixed-width, non-shrinking, overflow-safe) */}
          <View style={[styles.dateBlock, isExpanded && styles.dateBlockExpanded]}>
            <Text
              style={[styles.day, isExpanded && styles.dayExpanded]}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.15}
            >
              {day}
            </Text>
            <Text
              style={[styles.month, isExpanded && styles.monthExpanded]}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.15}
            >
              {month}
            </Text>
          </View>

          {/* Schedule Info / Meta */}
          <View style={styles.meta}>
            <Text
              style={styles.name}
              numberOfLines={2}
              maxFontSizeMultiplier={1.2}
            >
              {cleanName}
            </Text>
            <Text
              style={styles.date}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {formattedDate}
            </Text>

            {schedule.venue ? (
              <Text
                style={styles.venue}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                Venue: {schedule.venue}
              </Text>
            ) : schedule.description && schedule.batchCount === 1 ? (
              <Text
                style={styles.venue}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                Venue: {schedule.description}
              </Text>
            ) : null}

            <View style={styles.batchBadge}>
              <Clock size={12} color="#0055A4" />
              <Text
                style={styles.batches}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {sessionCount} Available Time Slot{sessionCount === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <ScheduleStatusBadge status={headerStatus} />
              {windowHint && headerStatus === 'not_opened' ? (
                <Text style={styles.windowHint}>{windowHint}</Text>
              ) : null}
            </View>
          </View>

          {/* Dropdown Chevron (Right-aligned, never pushed down) */}
          <Animated.View
            style={[styles.chevronWrap, { transform: [{ rotate: chevronRotation }] }]}
          >
            <ChevronDown size={20} color={isExpanded ? '#003366' : colors.inkMuted} />
          </Animated.View>
        </View>
      </Pressable>

      {/* SCHEDULE DROPDOWN (Time Slots List) */}
      {isExpanded && (
        <View style={styles.dropdownContainer}>
          <View style={styles.dropdownDivider} />

          <View style={styles.dropdownHeader}>
            <Text
              style={styles.dropdownHeaderTitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              AVAILABLE TIME SLOTS
            </Text>
            <Text
              style={styles.dropdownHeaderSubtitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              Not opened yet? Tap the slot to open it. Ended only after you finish the exam.
            </Text>
          </View>

          {sessionsQuery.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#003366" />
              <Text style={styles.loadingText} maxFontSizeMultiplier={1.15}>
                Loading time slots…
              </Text>
            </View>
          ) : (sessionsQuery.data?.length ?? 0) === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.15}>
                No time slots scheduled for this examination.
              </Text>
            </View>
          ) : (
            <View style={styles.timeSlotsList}>
              {sessionsQuery.data!.map((session, sIdx) => {
                const visual = slotStatus(session);
                const isActive = visual === 'open' || visual === 'in_progress';
                const isEnded = visual === 'ended';

                return (
                <Pressable
                  key={session.id || sIdx}
                  onPress={() => onSelectTimeSlot?.(session)}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.timeSlotRow,
                        pressed && styles.timeSlotPressed,
                        isActive && styles.timeSlotRowOpen,
                        isEnded && styles.timeSlotRowEnded,
                      ]}
                    >
                      <ScheduleStatusDot status={visual} />

                      <View style={styles.timeSlotInfo}>
                        <View style={styles.timeSlotTitleRow}>
                          <Text
                            style={[
                              styles.timeSlotTitle,
                              isActive && { color: '#C2410C' },
                              visual === 'in_progress' && { color: '#1D4ED8' },
                              isEnded && { color: '#15803D' },
                            ]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.2}
                          >
                            {session.timeLabel}
                          </Text>
                          <ScheduleStatusBadge status={visual} compact />
                        </View>
                        <Text
                          style={styles.timeSlotAction}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {EXAM_STATUS_HINTS[visual]}
                        </Text>
                        <View style={styles.timeSlotDetails}>
                          <Text
                            style={styles.timeSlotBatch}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {session.batchNumber}
                          </Text>
                          <Text style={styles.timeSlotDot}>•</Text>
                          <Text
                            style={styles.timeSlotVenue}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {session.venue || 'Campus Venue'}
                          </Text>
                          <Text style={styles.timeSlotDot}>•</Text>
                          <Text
                            style={styles.timeSlotExaminees}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {session.registeredStudents} Examinees
                          </Text>
                        </View>
                      </View>

                      <View style={styles.timeSlotArrow}>
                        <ChevronRight
                          size={18}
                          color={
                            visual === 'in_progress'
                              ? '#2563EB'
                              : isActive
                                ? '#EA580C'
                                : isEnded
                                  ? '#16A34A'
                                  : '#64748B'
                          }
                        />
                      </View>
                    </View>
                  )}
                </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function ScheduleStatusDot({ status }: { status: ExamSlotVisualStatus }) {
  if (status === 'ended') {
    return (
      <View style={[styles.statusDot, styles.statusDotEnded]}>
        <CheckCircle2 size={16} color="#16A34A" strokeWidth={2.4} />
      </View>
    );
  }
  if (status === 'in_progress') {
    return <View style={[styles.statusDot, styles.statusDotProgress]} />;
  }
  if (status === 'open') {
    return <View style={[styles.statusDot, styles.statusDotOpen]} />;
  }
  return <View style={[styles.statusDot, styles.statusDotClosed]} />;
}

function ScheduleStatusBadge({
  status,
  compact = false,
}: {
  status: ExamSlotVisualStatus;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusBadge,
        status === 'ended' && styles.statusBadgeEnded,
        status === 'open' && styles.statusBadgeOpen,
        status === 'in_progress' && styles.statusBadgeProgress,
        status === 'not_opened' && styles.statusBadgeClosed,
        compact && { marginLeft: 8, marginTop: 0 },
      ]}
    >
      {status === 'ended' ? (
        <CheckCircle2 size={11} color="#15803D" strokeWidth={2.4} />
      ) : (
        <View
          style={[
            styles.statusBadgeDot,
            status === 'open' && styles.statusBadgeDotOpen,
            status === 'in_progress' && styles.statusBadgeDotProgress,
            status === 'not_opened' && styles.statusBadgeDotClosed,
          ]}
        />
      )}
      <Text
        style={[
          styles.statusBadgeText,
          status === 'ended' && { color: '#15803D' },
          status === 'open' && { color: '#C2410C' },
          status === 'in_progress' && { color: '#1D4ED8' },
          status === 'not_opened' && { color: '#475569' },
        ]}
      >
        {EXAM_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    padding: 0,
    ...shadows.card,
  },
  cardExpanded: {
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  headerPressed: {
    backgroundColor: '#F8FAFC',
  },
  dateBlock: {
    width: 68,
    minWidth: 68,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexShrink: 0,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  dateBlockExpanded: {
    backgroundColor: '#EBF3FE',
    borderColor: '#BFDBFE',
  },
  day: {
    fontSize: 22,
    fontWeight: '900',
    color: '#003366',
    lineHeight: 26,
    textAlign: 'center',
  },
  dayExpanded: {
    color: '#0055A4',
  },
  month: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  monthExpanded: {
    color: '#0055A4',
  },
  meta: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: '#003366',
    lineHeight: 20,
  },
  date: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 1,
  },
  venue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  batchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  batches: {
    fontSize: 12,
    color: '#0055A4',
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  windowHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    flexShrink: 0,
  },
  dropdownContainer: {
    backgroundColor: '#F8FAFC',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  dropdownHeader: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 2,
  },
  dropdownHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0055A4',
    letterSpacing: 0.6,
  },
  dropdownHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
  timeSlotsList: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  timeSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  timeSlotPressed: {
    backgroundColor: '#EBF3FE',
    borderColor: '#93C5FD',
  },
  timeSlotRowOpen: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
  },
  timeSlotRowEnded: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  timeSlotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  timeSlotAction: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  timeSlotIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF3FE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timeSlotInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  timeSlotTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003366',
  },
  timeSlotDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  timeSlotBatch: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0055A4',
  },
  timeSlotDot: {
    fontSize: 11,
    color: '#94A3B8',
    marginHorizontal: 3,
  },
  timeSlotVenue: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  timeSlotExaminees: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  timeSlotArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lobbyOpenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  lobbyOpenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  lobbyOpenBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  endedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  endedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
  },
  endedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusDotEnded: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusDotOpen: {
    backgroundColor: '#F97316',
    borderWidth: 1,
    borderColor: '#EA580C',
  },
  statusDotProgress: {
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  statusDotClosed: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    marginTop: 6,
  },
  statusBadgeEnded: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusBadgeOpen: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  statusBadgeProgress: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  statusBadgeClosed: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
  },
  statusBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeDotOpen: {
    backgroundColor: '#EA580C',
  },
  statusBadgeDotProgress: {
    backgroundColor: '#2563EB',
  },
  statusBadgeDotClosed: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#64748B',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
