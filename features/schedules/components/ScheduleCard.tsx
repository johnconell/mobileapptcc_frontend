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
import type { ExamSchedule, ExamSession } from '@/shared/types';
import { colors, shadows } from '@/shared/theme';
import { Card } from '@/shared/components/ui';
import { useSessions } from '@/features/schedules/hooks/useSchedules';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import {
  deriveExamSlotStatus,
  examWindowHint,
  examWindowHintLabel,
  EXAM_STATUS_HINTS,
  EXAM_STATUS_LABELS,
  matchOpenedRoom,
  summarizeScheduleStatus,
  type ExamSlotVisualStatus,
} from '@/features/schedules/utils/examScheduleStatus';

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
  const { colors: themeColors, isDark } = useAppTheme();
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
    <Card delay={delay} style={{ ...styles.card, backgroundColor: themeColors.card, borderColor: isExpanded ? '#7A1F2B' : themeColors.cardBorder }}>
      {/* SCHEDULE CARD HEADER (Expandable trigger) */}
      <Pressable
        onPress={handleHeaderPress}
        onPressIn={() => setHeaderPressed(true)}
        onPressOut={() => setHeaderPressed(false)}
      >
        <View style={[styles.headerRow, headerPressed && { backgroundColor: themeColors.cardMuted }]}>
          {/* Calendar Date Block (Fixed-width, non-shrinking, overflow-safe) */}
          <View
            style={[
              styles.dateBlock,
              {
                backgroundColor: isDark ? '#2A1414' : '#FEE2E2',
                borderColor: isDark ? '#7A1F2B40' : '#FCA5A5',
              },
              isExpanded && {
                backgroundColor: isDark ? '#351616' : '#FECACA',
                borderColor: '#7A1F2B',
              },
            ]}
          >
            <Text
              style={[styles.day, { color: isDark ? '#FFFFFF' : '#991B1B' }]}
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
              style={[styles.name, { color: themeColors.textPrimary }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.2}
            >
              {cleanName}
            </Text>
            <Text
              style={[styles.date, { color: themeColors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {formattedDate}
            </Text>

            {schedule.venue ? (
              <Text
                style={[styles.venue, { color: themeColors.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                Venue: {schedule.venue}
              </Text>
            ) : schedule.description && schedule.batchCount === 1 ? (
              <Text
                style={[styles.venue, { color: themeColors.textMuted }]}
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
                <Text style={[styles.windowHint, { color: themeColors.textMuted }]}>{windowHint}</Text>
              ) : null}
            </View>
          </View>

          {/* Dropdown Chevron (Right-aligned, never pushed down) */}
          <Animated.View
            style={[
              styles.chevronWrap,
              {
                backgroundColor: themeColors.cardMuted,
                transform: [{ rotate: chevronRotation }],
              },
            ]}
          >
            <ChevronDown size={20} color={isExpanded ? '#7A1F2B' : '#71717A'} />
          </Animated.View>
        </View>
      </Pressable>

      {/* SCHEDULE DROPDOWN (Time Slots List) */}
      {isExpanded && (
        <View style={[styles.dropdownContainer, { backgroundColor: isDark ? '#101010' : themeColors.cardMuted }]}>
          <View style={[styles.dropdownDivider, { backgroundColor: themeColors.cardBorder }]} />

          <View style={styles.dropdownHeader}>
            <Text
              style={[styles.dropdownHeaderTitle, { color: themeColors.textMuted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              AVAILABLE TIME SLOTS
            </Text>
            <Text
              style={[styles.dropdownHeaderSubtitle, { color: themeColors.textSecondary }]}
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
                        {
                          backgroundColor: themeColors.card,
                          borderColor: themeColors.cardBorder,
                        },
                        pressed && { backgroundColor: themeColors.cardMuted },
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
                              { color: themeColors.textPrimary },
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
                          style={[styles.timeSlotAction, { color: themeColors.textSecondary }]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {EXAM_STATUS_HINTS[visual]}
                        </Text>
                        <View style={styles.timeSlotDetails}>
                          <Text
                            style={[styles.timeSlotBatch, { color: themeColors.textPrimary }]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {session.batchNumber}
                          </Text>
                          <Text style={styles.timeSlotDot}>•</Text>
                          <Text
                            style={[styles.timeSlotVenue, { color: themeColors.textSecondary }]}
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

                      <View style={[styles.timeSlotArrow, { backgroundColor: themeColors.cardMuted }]}>
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
  const { isDark } = useAppTheme();
  if (status === 'ended') {
    return (
      <View style={[styles.circularStatusWrap, { backgroundColor: isDark ? '#142918' : '#DCFCE7' }]}>
        <CheckCircle2 size={18} color={isDark ? '#22C55E' : '#16A34A'} />
      </View>
    );
  }
  if (status === 'open') {
    return (
      <View style={[styles.circularStatusWrap, { backgroundColor: isDark ? '#2A1414' : '#FEE2E2' }]}>
        <Clock size={18} color={isDark ? '#7A1F2B' : '#DC2626'} />
      </View>
    );
  }
  if (status === 'in_progress') {
    return (
      <View style={[styles.circularStatusWrap, { backgroundColor: isDark ? '#1A2035' : '#E0E7FF' }]}>
        <Clock size={18} color={isDark ? '#3B82F6' : '#2563EB'} />
      </View>
    );
  }
  return (
    <View style={[styles.circularStatusWrap, { backgroundColor: isDark ? '#1F1F1F' : '#EFEAE1' }]}>
      <Clock size={18} color={isDark ? '#71717A' : '#786B59'} />
    </View>
  );
}

function ScheduleStatusBadge({
  status,
  compact = false,
}: {
  status: ExamSlotVisualStatus;
  compact?: boolean;
}) {
  const { isDark } = useAppTheme();

  const getBadgeStyle = () => {
    switch (status) {
      case 'ended':
        return {
          backgroundColor: isDark ? '#142918' : '#DCFCE7',
          borderColor: isDark ? '#22C55E40' : '#86EFAC',
          textColor: isDark ? '#4ADE80' : '#166534',
        };
      case 'open':
        return {
          backgroundColor: isDark ? '#2A1414' : '#FEE2E2',
          borderColor: isDark ? '#7A1F2B50' : '#FECACA',
          textColor: isDark ? '#F87171' : '#B91C1C',
        };
      case 'in_progress':
        return {
          backgroundColor: isDark ? '#1E293B' : '#E0E7FF',
          borderColor: isDark ? '#3B82F650' : '#BFDBFE',
          textColor: isDark ? '#60A5FA' : '#1D4ED8',
        };
      case 'not_opened':
      default:
        return {
          backgroundColor: isDark ? '#1E1E1E' : '#EFEAE1',
          borderColor: isDark ? '#52525B' : '#D4CBB8',
          textColor: isDark ? '#A1A1AA' : '#5A4E3E',
        };
    }
  };

  const badgeTheme = getBadgeStyle();

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: badgeTheme.backgroundColor,
          borderColor: badgeTheme.borderColor,
          borderWidth: 1,
        },
        compact && { marginLeft: 8, marginTop: 0 },
      ]}
    >
      {status === 'ended' ? (
        <CheckCircle2 size={11} color={badgeTheme.textColor} strokeWidth={2.4} />
      ) : (
        <View
          style={[
            styles.statusBadgeDot,
            {
              backgroundColor:
                status === 'open'
                  ? isDark ? '#7A1F2B' : '#DC2626'
                  : status === 'in_progress'
                  ? isDark ? '#3B82F6' : '#2563EB'
                  : isDark ? '#71717A' : '#786B59',
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.statusBadgeText,
          { color: badgeTheme.textColor },
        ]}
      >
        {EXAM_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    ...shadows.card,
  },
  cardExpanded: {
    borderColor: '#7A1F2B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  headerPressed: {},
  dateBlock: {
    width: 60,
    minWidth: 60,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  dateBlockExpanded: {
    borderColor: '#7A1F2B',
  },
  day: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  dayExpanded: {},
  month: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7A1F2B',
    marginTop: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  monthExpanded: {
    color: '#7A1F2B',
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
    lineHeight: 20,
  },
  date: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  venue: {
    fontSize: 12,
    fontWeight: '600',
  },
  batchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  batches: {
    fontSize: 12,
    color: '#7A1F2B',
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
    color: '#71717A',
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dropdownContainer: {},
  dropdownDivider: {
    height: 1,
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
    color: '#A1A1AA',
    letterSpacing: 0.6,
  },
  dropdownHeaderSubtitle: {
    fontSize: 11,
    color: '#71717A',
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginVertical: 4,
    borderWidth: 1,
    gap: 12,
  },
  timeSlotPressed: {},
  timeSlotRowOpen: {
    borderLeftWidth: 4,
    borderLeftColor: '#7A1F2B',
  },
  timeSlotRowEnded: {
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  timeSlotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  timeSlotAction: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  circularStatusWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timeSlotIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
  },
  timeSlotDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  timeSlotBatch: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeSlotDot: {
    fontSize: 11,
    color: '#71717A',
    marginHorizontal: 3,
  },
  timeSlotVenue: {
    fontSize: 11,
    fontWeight: '500',
  },
  timeSlotExaminees: {
    fontSize: 11,
    color: '#7A1F2B',
    fontWeight: '700',
  },
  timeSlotArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lobbyOpenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#142918',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  lobbyOpenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  lobbyOpenBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  endedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  endedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#71717A',
  },
  endedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#A1A1AA',
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
    backgroundColor: '#142918',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  statusDotOpen: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#7A1F2B',
  },
  statusDotProgress: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statusDotClosed: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#52525B',
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
    backgroundColor: '#142918',
    borderWidth: 1,
    borderColor: '#22C55E40',
  },
  statusBadgeOpen: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#7A1F2B50',
  },
  statusBadgeProgress: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F650',
  },
  statusBadgeClosed: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#52525B',
  },
  statusBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeDotOpen: {
    backgroundColor: '#7A1F2B',
  },
  statusBadgeDotProgress: {
    backgroundColor: '#3B82F6',
  },
  statusBadgeDotClosed: {
    backgroundColor: '#52525B',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
