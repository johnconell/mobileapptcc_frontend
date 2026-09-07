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
import { ChevronDown, ChevronRight, Clock } from 'lucide-react-native';
import type { ExamSchedule, ExamSession } from '@/types';
import { colors, shadows } from '@/theme';
import { Card } from '@/components/ui';
import { useSessions } from '@/hooks/useRepositories';

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
  const sessionsQuery = useSessions(isExpanded ? schedule.id : undefined);
  const [headerPressed, setHeaderPressed] = useState(false);

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
              Select a time slot to open or enter lobby
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
                const cleanSess = String(session.id).replace(/^offline-/, '');
                const sessSchedId = parseInt(cleanSess.split('-')[0] || '', 10) || 0;
                const matchingRooms = Object.entries(openedRooms || {}).filter(([k]) => {
                  const [s] = k.split(':').map(Number);
                  return s === sessSchedId || String(k).startsWith(`${sessSchedId}:`);
                });
                const isLobbyOpen = matchingRooms.some(
                  ([, v]) => v.status === 'lobby_open' || v.status === 'in_progress',
                );
                const isEnded = !isLobbyOpen && matchingRooms.some(([, v]) => v.status === 'ended');

                return (
                <Pressable
                  key={session.id || sIdx}
                  onPress={() => onSelectTimeSlot?.(session)}
                >
                  {({ pressed }) => (
                    <View style={[styles.timeSlotRow, pressed && styles.timeSlotPressed]}>
                      <View
                        style={[
                          styles.timeSlotIconWrap,
                          isLobbyOpen && { backgroundColor: '#E6F4EA' },
                          isEnded && { backgroundColor: '#F1F5F9' },
                        ]}
                      >
                        <Clock
                          size={16}
                          color={isLobbyOpen ? '#28A745' : isEnded ? '#64748B' : '#003366'}
                        />
                      </View>

                      <View style={styles.timeSlotInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text
                            style={[
                              styles.timeSlotTitle,
                              isLobbyOpen && { color: '#16A34A', fontWeight: '800' },
                              isEnded && { color: '#475569', fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.2}
                          >
                            {session.timeLabel}
                          </Text>
                          {isLobbyOpen && (
                            <View style={styles.lobbyOpenBadge}>
                              <View style={styles.lobbyOpenDot} />
                              <Text style={styles.lobbyOpenBadgeText}>LOBBY OPEN</Text>
                            </View>
                          )}
                          {isEnded && (
                            <View style={styles.endedBadge}>
                              <View style={styles.endedDot} />
                              <Text style={styles.endedBadgeText}>ENDED</Text>
                            </View>
                          )}
                        </View>
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
                          color={isLobbyOpen ? '#28A745' : isEnded ? '#94A3B8' : '#0055A4'}
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
});
