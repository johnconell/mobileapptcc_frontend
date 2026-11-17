import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Users,
} from 'lucide-react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import type { ScheduleEntry } from '@/features/schedules/components/ProctorScheduleRow';
import type { OfficialExaminationDay } from '@/features/schedules/repositories/ScheduleRepository';
import { matchOpenedRoom } from '@/features/schedules/utils/examScheduleStatus';
import {
  formatManilaScheduleDate,
  formatScheduleOpeningTime,
  getProctorScheduleAvailability,
  getScheduleTimelinePhase,
} from '@/features/schedules/utils/proctorScheduleWindow';
import {
  buildOfficialDays,
  entryDate,
  hasRoomChange,
  roomName,
  schedulePeriod,
  sortScheduleEntries,
  summarizeAssignments,
} from '@/features/schedules/utils/myScheduleOverview';
import {
  scheduleRedesignLayout,
  useScheduleRedesignTheme,
} from './scheduleRedesignTheme';

type OpenedRooms = Record<
  string,
  { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }
>;

type Props = {
  entries: ScheduleEntry[];
  officialDays: OfficialExaminationDay[];
  todayIso: string;
  nowMs: number;
  openedRooms: OpenedRooms;
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
  onOpen: (entry: ScheduleEntry) => void;
  needsPackUpdate?: boolean;
  packUpdateBusy?: boolean;
  onDownloadPack?: () => void;
};

function compactDate(date: string): { weekday: string; date: string } {
  const value = new Date(`${date}T00:00:00Z`);
  return {
    weekday: value.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' }),
    date: value.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }),
  };
}

export function MyExaminationSchedule({
  entries,
  officialDays,
  todayIso,
  nowMs,
  openedRooms,
  loading = false,
  error,
  onRetry,
  onOpen,
  needsPackUpdate = false,
  packUpdateBusy = false,
  onDownloadPack,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const redesignTheme = useScheduleRedesignTheme();
  const [tab, setTab] = useState<'today' | 'full'>('today');
  const days = useMemo(() => buildOfficialDays(officialDays, entries), [officialDays, entries]);
  const initialDay = useMemo(
    () => days.find((day) => day.date === todayIso)?.date ?? days.find((day) => day.date > todayIso)?.date ?? days[0]?.date ?? todayIso,
    [days, todayIso],
  );
  const [selectedDay, setSelectedDay] = useState(initialDay);

  useEffect(() => {
    if (!days.some((day) => day.date === selectedDay)) setSelectedDay(initialDay);
  }, [days, initialDay, selectedDay]);

  const summary = useMemo(() => summarizeAssignments(days, entries), [days, entries]);
  const visibleDate = tab === 'today' ? todayIso : selectedDay;
  const visibleEntries = useMemo(
    () => sortScheduleEntries(entries.filter((entry) => entryDate(entry) === visibleDate)),
    [entries, visibleDate],
  );

  if (tab === 'today') {
    return (
      <TodayScheduleRedesign
        entries={visibleEntries}
        todayIso={todayIso}
        nowMs={nowMs}
        openedRooms={openedRooms}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onOpen={onOpen}
        needsPackUpdate={needsPackUpdate}
        packUpdateBusy={packUpdateBusy}
        onDownloadPack={onDownloadPack}
        onSelectFullSchedule={() => setTab('full')}
        theme={redesignTheme}
      />
    );
  }

  return (
    <FullScheduleRedesign
      entries={visibleEntries}
      days={days}
      selectedDay={selectedDay}
      todayIso={todayIso}
      nowMs={nowMs}
      openedRooms={openedRooms}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onSelectToday={() => {
        setSelectedDay(todayIso);
        setTab('today');
      }}
      onSelectDay={setSelectedDay}
      theme={redesignTheme}
    />
  );

  const statusFor = (entry: ScheduleEntry) => {
    const opened = matchOpenedRoom(openedRooms, entry.session);
    if (opened?.status === 'in_progress') return { label: 'In progress', tone: colors.success };
    if (opened?.status === 'lobby_open') return { label: 'Lobby open', tone: colors.success };
    if (opened?.status === 'ended') return { label: 'Completed', tone: colors.textMuted };
    const phase = getScheduleTimelinePhase(
      {
        date: entryDate(entry),
        startTime: entry.session.startTime,
        endTime: entry.session.endTime,
        timeLabel: entry.session.timeLabel,
      },
      nowMs,
    );
    if (phase === 'active') return { label: 'In progress', tone: colors.success };
    if (phase === 'completed') return { label: 'Ended', tone: colors.textMuted };
    return { label: entry.session.sessionType === 'rescheduled' ? 'Reschedule' : 'Scheduled', tone: colors.accent };
  };

  return (
    <View style={styles.root}>
      <View style={[styles.tabs, { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder }]}>
        {([
          ['today', "Today's Schedule"],
          ['full', 'My Full Schedule'],
        ] as const).map(([value, label]) => {
          const active = tab === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(value)}
              style={[styles.tab, active && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.tabText, { color: active ? (isDark ? colors.background : '#FFFFFF') : colors.textSecondary }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.summaryTitleRow}>
          <CalendarDays size={17} color={colors.accent} />
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Assignment overview</Text>
        </View>
        <View style={styles.summaryGrid}>
          {[
            [summary.totalDays, 'Exam days'],
            [summary.assignedDays, 'Assigned days'],
            [summary.assignedBatches, 'Batches'],
            [summary.uniqueRooms, 'Rooms'],
          ].map(([value, label]) => (
            <View key={label} style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{value}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {tab === 'full' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daySelector}
          accessibilityRole="tablist"
        >
          {days.map((day) => {
            const active = selectedDay === day.date;
            const assigned = entries.some((entry) => entryDate(entry) === day.date);
            const label = compactDate(day.date);
            return (
              <Pressable
                key={day.date}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${day.dayLabel}, ${formatManilaScheduleDate(day.date)}`}
                onPress={() => setSelectedDay(day.date)}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: active ? colors.accent : colors.card,
                    borderColor: active ? colors.accent : colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.dayNumber, { color: active ? (isDark ? colors.background : '#FFFFFF') : colors.textPrimary }]}>
                  {day.dayLabel}
                </Text>
                <Text style={[styles.dayDate, { color: active ? (isDark ? colors.background : '#FFFFFF') : colors.textSecondary }]}>
                  {label.weekday} · {label.date}
                </Text>
                <View style={[styles.assignmentDot, { backgroundColor: assigned ? (active ? '#FFFFFF' : colors.accentGold) : 'transparent' }]} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.dayHeading}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dayTitle, { color: colors.textPrimary }]}>Examination Schedule</Text>
          <Text style={[styles.daySubtitle, { color: colors.textSecondary }]}>
            {formatManilaScheduleDate(visibleDate, true)}
          </Text>
        </View>
        <Text style={[styles.batchCount, { color: colors.textSecondary }]}>
          {visibleEntries.length} batch{visibleEntries.length === 1 ? '' : 'es'}
        </Text>
      </View>

      {loading ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Loading assignments…</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Schedule unavailable</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable onPress={onRetry} style={[styles.retryButton, { borderColor: colors.accent }]}>
            <Text style={[styles.retryText, { color: colors.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : !visibleEntries.length ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <CalendarDays size={24} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No examination schedule</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            The official examination calendar has no batches for this day.
          </Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {visibleEntries.map((entry, index) => {
            const previous = visibleEntries[index - 1];
            const period = schedulePeriod(entry);
            const startsGroup = index === 0 || schedulePeriod(previous) !== period;
            const changedRoom = hasRoomChange(previous, entry);
            const status = statusFor(entry);
            const room = roomName(entry) || 'Room pending';
            const availability = getProctorScheduleAvailability(
              {
                date: entryDate(entry),
                startTime: entry.session.startTime,
                endTime: entry.session.endTime,
                timeLabel: entry.session.timeLabel,
              },
              nowMs,
              todayIso,
            );
            const opened = matchOpenedRoom(openedRooms, entry.session);
            const actionEnabled = false;
            const actionLabel = opened?.status === 'in_progress' ? 'Enter Exam' : opened ? 'Enter Lobby' : 'Open Room';
            return (
              <View key={`${entry.schedule.id}:${entry.session.id}:${index}`}>
                {startsGroup ? (
                  <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{period}</Text>
                ) : null}
                {changedRoom ? (
                  <View style={[styles.roomChange, { backgroundColor: colors.warningMuted, borderColor: colors.warning }]}>
                    <ArrowRight size={15} color={colors.warning} />
                    <Text style={[styles.roomChangeText, { color: colors.warning }]}>
                      Room Change: {roomName(previous)} to {room}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.batchCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <View style={[styles.timelineRail, { backgroundColor: colors.accent }]} />
                  <View style={styles.batchContent}>
                    <View style={styles.batchTopRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.batchName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {entry.session.batchNumber}
                        </Text>
                        <View style={styles.inlineDetail}>
                          <Clock3 size={13} color={colors.textSecondary} />
                          <Text style={[styles.detailText, { color: colors.textSecondary }]}>{entry.session.timeLabel}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: colors.cardMuted }]}>
                        <View style={[styles.statusDot, { backgroundColor: status.tone }]} />
                        <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
                      </View>
                    </View>

                    <View style={[styles.roomPanel, { backgroundColor: colors.accentMuted }]}>
                      <MapPin size={18} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomLabel, { color: colors.textSecondary }]}>ASSIGNED ROOM</Text>
                        <Text style={[styles.roomValue, { color: colors.textPrimary }]}>{room}</Text>
                      </View>
                      <View style={styles.inlineDetail}>
                        <Users size={14} color={colors.textSecondary} />
                        <Text style={[styles.studentCount, { color: colors.textSecondary }]}>
                          {entry.session.registeredStudents}
                        </Text>
                      </View>
                    </View>

                    {false ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !actionEnabled }}
                        disabled={!actionEnabled}
                        onPress={() => onOpen(entry)}
                        style={[
                          styles.openButton,
                          { backgroundColor: actionEnabled ? colors.accent : colors.cardMuted },
                        ]}
                      >
                        <Text style={[styles.openButtonText, { color: actionEnabled ? (isDark ? colors.background : '#FFFFFF') : colors.textMuted }]}>
                          {availability === 'ended' && !opened ? 'Ended' : actionLabel}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function parseClockMinutes(value: string | undefined): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

type FullScheduleStatus = 'active' | 'upcoming' | 'completed';

function FullScheduleRedesign({
  entries,
  days,
  selectedDay,
  todayIso,
  nowMs,
  openedRooms,
  loading,
  error,
  onRetry,
  onSelectToday,
  onSelectDay,
  theme,
}: {
  entries: ScheduleEntry[];
  days: OfficialExaminationDay[];
  selectedDay: string;
  todayIso: string;
  nowMs: number;
  openedRooms: OpenedRooms;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
  onSelectToday: () => void;
  onSelectDay: (date: string) => void;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  const sortedEntries = sortScheduleEntries(entries);
  const statusFor = (entry: ScheduleEntry): FullScheduleStatus => {
    const opened = matchOpenedRoom(openedRooms, entry.session);
    if (opened?.status === 'in_progress') return 'active';
    if (opened?.status === 'ended') return 'completed';
    const phase = getScheduleTimelinePhase(
      {
        date: entryDate(entry),
        startTime: entry.session.startTime,
        endTime: entry.session.endTime,
        timeLabel: entry.session.timeLabel,
      },
      nowMs,
    );
    if (phase === 'active') return 'active';
    if (phase === 'completed') return 'completed';
    return 'upcoming';
  };
  const activeEntries = sortedEntries.filter((entry) => statusFor(entry) === 'active');
  const upcomingEntries = sortedEntries.filter((entry) => statusFor(entry) === 'upcoming');
  const completedEntries = sortedEntries
    .filter((entry) => statusFor(entry) === 'completed')
    .reverse();
  const firstUpcoming = upcomingEntries[0];
  const selectedDayMeta = days.find((day) => day.date === selectedDay);
  const otherDay = selectedDay !== todayIso;

  return (
    <View style={fullStyles.root}>
      <View style={[fullStyles.tabs, { backgroundColor: theme.tabTrack }]} accessibilityRole="tablist">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={onSelectToday} style={fullStyles.tab}>
          <Text style={[fullStyles.tabText, { color: theme.secondaryText }]}>Today&apos;s Schedule</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[fullStyles.tab, { backgroundColor: theme.primary }]}>
          <Text style={[fullStyles.tabText, { color: '#FFFFFF' }]}>My Full Schedule</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={fullStyles.daySelector}
        accessibilityRole="tablist"
      >
        {days.map((day) => {
          const active = selectedDay === day.date;
          const hasAssignments = entries.some((entry) => entryDate(entry) === day.date);
          const label = compactDate(day.date);
          return (
            <Pressable
              key={day.date}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${day.date === todayIso ? 'Today' : day.dayLabel}, ${formatManilaScheduleDate(day.date)}`}
              onPress={() => {
                if (day.date === todayIso) onSelectToday();
                else onSelectDay(day.date);
              }}
              style={[
                fullStyles.dayChip,
                {
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border,
                  opacity: day.date === todayIso || hasAssignments ? 1 : 0.72,
                },
              ]}
            >
              <Text style={[fullStyles.dayLabel, { color: active ? '#FFFFFF' : theme.text }]}>
                {day.date === todayIso ? 'Today' : day.dayLabel}
              </Text>
              <Text style={[fullStyles.dayDate, { color: active ? '#FFFFFF' : theme.secondaryText }]}>
                {label.weekday}, {label.date}
              </Text>
              <View style={[fullStyles.assignmentDot, { backgroundColor: hasAssignments ? (active ? '#FFFFFF' : theme.primary) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={fullStyles.headingRow}>
        <View style={fullStyles.headingCopy}>
          <Text style={[fullStyles.heading, { color: theme.text }]}>My Full Schedule</Text>
          <Text style={[fullStyles.headingDate, { color: theme.secondaryText }]}>
            {selectedDayMeta ? formatManilaScheduleDate(selectedDay, true) : selectedDay}
          </Text>
        </View>
        <Text style={[fullStyles.batchCount, { color: theme.secondaryText }]}>
          {entries.length} batch{entries.length === 1 ? '' : 'es'}
        </Text>
      </View>

      {loading ? (
        <ScheduleStateCard title="Loading your schedule…" theme={theme} />
      ) : error ? (
        <ScheduleStateCard title="Schedule unavailable" body={error} actionLabel="Retry" onAction={onRetry} theme={theme} />
      ) : !entries.length ? (
        <ScheduleStateCard title="No examination schedule" body="The official examination calendar has no batches for this day." theme={theme} />
      ) : (
        <>
          {activeEntries.length ? (
            <View>
              <ScheduleSectionLabel label="HAPPENING NOW" active theme={theme} />
              <View style={fullStyles.entryList}>
                {activeEntries.map((entry, index) => (
                  <View key={`${entry.schedule.id}:${entry.session.id}:active`} style={startsNewSchedulePeriod(activeEntries, index) ? fullStyles.periodBreak : undefined}>
                    <FullScheduleRow
                      entry={entry}
                      status="active"
                      theme={theme}
                      todayIso={todayIso}
                      nowMs={nowMs}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {upcomingEntries.length ? (
            <View>
              <ScheduleSectionLabel label={firstUpcoming ? 'UP NEXT' : 'UPCOMING'} theme={theme} />
              <View style={fullStyles.entryList}>
                {upcomingEntries.map((entry, index) => (
                  <View key={`${entry.schedule.id}:${entry.session.id}:upcoming`} style={startsNewSchedulePeriod(upcomingEntries, index) ? fullStyles.periodBreak : undefined}>
                    <FullScheduleRow
                      entry={entry}
                      status="upcoming"
                      emphasize={index === 0}
                      theme={theme}
                      todayIso={todayIso}
                      nowMs={nowMs}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {completedEntries.length ? (
            <View>
              <View style={fullStyles.doneHeading}>
                <ScheduleSectionLabel label={`DONE · ${completedEntries.length}`} theme={theme} />
                <Text style={[fullStyles.latestText, { color: theme.secondaryText }]}>Latest first</Text>
              </View>
              <View style={fullStyles.entryList}>
                {completedEntries.map((entry, index) => (
                  <View key={`${entry.schedule.id}:${entry.session.id}:completed`} style={startsNewSchedulePeriod(completedEntries, index) ? fullStyles.periodBreak : undefined}>
                    <FullScheduleRow
                      entry={entry}
                      status="completed"
                      theme={theme}
                      todayIso={todayIso}
                      nowMs={nowMs}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      {otherDay ? (
        <View style={[fullStyles.hint, { backgroundColor: theme.mutedSurface }]}>
          <CalendarDays size={17} color={theme.secondaryText} />
          <Text style={[fullStyles.hintText, { color: theme.secondaryText }]}>Other days are view only. “Open to all proctors” means no room is assigned to you yet.</Text>
        </View>
      ) : null}
    </View>
  );
}

function FullScheduleRow({
  entry,
  status,
  emphasize = false,
  theme,
  todayIso,
  nowMs,
}: {
  entry: ScheduleEntry;
  status: FullScheduleStatus;
  emphasize?: boolean;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
  todayIso: string;
  nowMs: number;
}) {
  const time = fullTimeParts(entry);
  const room = roomName(entry);
  const isToday = entryDate(entry) === todayIso;
  const startsIn = isToday
    ? Math.max(0, (entryClockMinutes(entry) ?? currentManilaMinutes(nowMs)) - currentManilaMinutes(nowMs))
    : 0;
  const statusLabel = status === 'active'
    ? 'Live'
    : emphasize && isToday
      ? `Starts in ${formatMinutes(startsIn)}`
      : emphasize
        ? 'Next'
        : 'Scheduled';
  const roomColor = room ? theme.successText : theme.warningText;
  const roomBackground = room ? theme.successBackground : theme.warningBackground;

  if (status === 'completed') {
    return (
      <View style={[fullStyles.doneRow, { backgroundColor: theme.mutedSurface }]}>
        <CheckCircle2 size={21} color={theme.secondaryText} />
        <View style={fullStyles.doneCopy}>
          <Text style={[fullStyles.doneTime, { color: theme.doneText }]}>{entry.session.timeLabel}</Text>
          <Text style={[fullStyles.doneMeta, { color: theme.secondaryText }]}>{entry.session.batchNumber} · {room || 'Room pending'}</Text>
        </View>
        <Text style={[fullStyles.doneCount, { color: theme.secondaryText }]}>{entry.session.registeredStudents ?? 0}</Text>
      </View>
    );
  }

  return (
    <View style={[fullStyles.rowCard, { backgroundColor: theme.surface, borderColor: status === 'active' ? theme.primary : theme.border, borderWidth: status === 'active' ? 2 : 1 }]}>
      <View style={fullStyles.timeBlock}>
        {time ? (
          <>
            <Text style={[fullStyles.startTime, { color: theme.text }]}>{time.startClock}</Text>
            <Text style={[fullStyles.timePeriod, { color: theme.secondaryText }]}>{time.startPeriod}</Text>
            <Text style={[fullStyles.endTime, { color: theme.secondaryText }]}>– {time.endClock} {time.endPeriod}</Text>
          </>
        ) : (
          <Text style={[fullStyles.fallbackTime, { color: theme.text }]}>{entry.session.timeLabel}</Text>
        )}
      </View>

      <View style={fullStyles.rowContent}>
        <View style={fullStyles.rowTopLine}>
          <View style={fullStyles.rowCopy}>
            <Text style={[fullStyles.batchName, { color: theme.text }]} numberOfLines={1}>{entry.session.batchNumber}</Text>
            <Text style={[fullStyles.periodText, { color: theme.secondaryText }]}>{schedulePeriod(entry)}</Text>
          </View>
          <SchedulePill
            label={statusLabel}
            background={status === 'active' ? theme.successBackground : emphasize ? theme.warningBackground : theme.primaryTint}
            color={status === 'active' ? theme.successText : emphasize ? theme.warningText : theme.primary}
          />
        </View>
        <View style={[fullStyles.roomLine, { backgroundColor: roomBackground }]}>
          <MapPin size={16} color={roomColor} />
          <Text style={[fullStyles.roomText, { color: roomColor }]} numberOfLines={1}>{room || 'Open to all proctors'}</Text>
          <View style={fullStyles.examineeCount}>
            <Users size={14} color={theme.secondaryText} />
            <Text style={[fullStyles.examineeText, { color: theme.secondaryText }]}>{entry.session.registeredStudents ?? 0}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function fullTimeParts(entry: ScheduleEntry): { startClock: string; startPeriod: string; endClock: string; endPeriod: string } | null {
  const parts = String(entry.session.timeLabel || '').split(/\s*(?:-|\u2013|\u2014|to)\s*/i);
  const start = formatClockPart(entry.session.startTime || parts[0]);
  const end = formatClockPart(entry.session.endTime || parts[1]);
  if (!start || !end) return null;
  return { startClock: start.clock, startPeriod: start.period, endClock: end.clock, endPeriod: end.period };
}

function formatClockPart(value: string | undefined): { clock: string; period: string } | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const explicitPeriod = match[3]?.toUpperCase();
  const period = explicitPeriod || (hour >= 12 ? 'PM' : 'AM');
  if (!explicitPeriod) hour %= 12;
  else if (hour > 12) hour %= 12;
  if (hour === 0) hour = 12;
  return { clock: `${hour}:${String(minute).padStart(2, '0')}`, period };
}

function entryClockMinutes(entry: ScheduleEntry, end = false): number | null {
  const direct = end ? entry.session.endTime : entry.session.startTime;
  if (direct) return parseClockMinutes(direct);
  const parts = String(entry.session.timeLabel || '').split(/\s*(?:-|â€“|â€”|to)\s*/i);
  return parseClockMinutes(parts[end ? 1 : 0]);
}

function currentManilaMinutes(nowMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function formatMinutes(value: number): string {
  const safe = Math.max(0, Math.round(value));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function entryRoomsLabel(entry: ScheduleEntry): string {
  return roomName(entry) || 'Room pending';
}

function startsNewSchedulePeriod(entries: ScheduleEntry[], index: number): boolean {
  return index > 0 && schedulePeriod(entries[index]) !== schedulePeriod(entries[index - 1]);
}

function TodayScheduleRedesign({
  entries,
  todayIso,
  nowMs,
  openedRooms,
  loading,
  error,
  onRetry,
  onOpen,
  needsPackUpdate,
  packUpdateBusy,
  onDownloadPack,
  onSelectFullSchedule,
  theme,
}: {
  entries: ScheduleEntry[];
  todayIso: string;
  nowMs: number;
  openedRooms: OpenedRooms;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
  onOpen: (entry: ScheduleEntry) => void;
  needsPackUpdate: boolean;
  packUpdateBusy: boolean;
  onDownloadPack?: () => void;
  onSelectFullSchedule: () => void;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  const nowMinutes = currentManilaMinutes(nowMs);
  const phaseFor = (entry: ScheduleEntry) => getScheduleTimelinePhase(
    {
      date: entryDate(entry),
      startTime: entry.session.startTime,
      endTime: entry.session.endTime,
      timeLabel: entry.session.timeLabel,
    },
    nowMs,
  );
  const openedFor = (entry: ScheduleEntry) => matchOpenedRoom(openedRooms, entry.session);
  const activeEntry = entries.find((entry) => {
    const opened = openedFor(entry);
    return opened?.status === 'in_progress' || phaseFor(entry) === 'active';
  });
  const completedEntries = sortScheduleEntries(entries.filter((entry) => {
    const opened = openedFor(entry);
    return opened?.status === 'ended' || phaseFor(entry) === 'completed';
  })).reverse();
  const nextEntry = entries.find((entry) => entry !== activeEntry && !completedEntries.includes(entry));
  const roomCount = new Set(entries.map(roomName).filter(Boolean)).size;
  const activeMinutesLeft = activeEntry
    ? Math.max(0, (entryClockMinutes(activeEntry, true) ?? nowMinutes) - nowMinutes)
    : 0;
  const nextStartsIn = nextEntry
    ? Math.max(0, (entryClockMinutes(nextEntry) ?? nowMinutes) - nowMinutes)
    : 0;
  const nextStartsNewPeriod = Boolean(
    activeEntry && nextEntry && schedulePeriod(activeEntry) !== schedulePeriod(nextEntry),
  );
  const entryBeforeCompleted = nextEntry ?? activeEntry;
  const completedStartsNewPeriod = Boolean(
    entryBeforeCompleted
      && completedEntries[0]
      && schedulePeriod(entryBeforeCompleted) !== schedulePeriod(completedEntries[0]),
  );
  const actionFor = (entry: ScheduleEntry) => {
    const opened = openedFor(entry);
    const availability = getProctorScheduleAvailability(
      {
        date: entryDate(entry),
        startTime: entry.session.startTime,
        endTime: entry.session.endTime,
        timeLabel: entry.session.timeLabel,
      },
      nowMs,
      todayIso,
    );
    return {
      enabled: Boolean(opened) || availability === 'available',
      label: opened?.status === 'in_progress' ? 'Enter Exam' : opened ? 'Enter Lobby' : 'Open Room',
      availability,
    };
  };

  return (
    <View style={todayStyles.root}>
      {needsPackUpdate ? (
        <View style={[todayStyles.updateBanner, { backgroundColor: theme.dangerBackground, borderColor: theme.dangerBorder }]}>
          <AlertTriangle size={22} color={theme.dangerText} />
          <View style={todayStyles.updateCopy}>
            <Text style={[todayStyles.updateTitle, { color: theme.dangerText }]}>Exam pack needs an update</Text>
            <Text style={[todayStyles.updateBody, { color: theme.secondaryText }]}>Download before opening rooms.</Text>
          </View>
          {onDownloadPack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download exam pack"
              disabled={packUpdateBusy}
              onPress={onDownloadPack}
              style={[todayStyles.downloadButton, { backgroundColor: theme.primary }, packUpdateBusy && todayStyles.disabled]}
            >
              <Text style={[todayStyles.downloadButtonText, { color: '#FFFFFF' }]}>{packUpdateBusy ? 'Updating…' : 'Download'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[todayStyles.tabs, { backgroundColor: theme.tabTrack }]} accessibilityRole="tablist">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[todayStyles.tab, { backgroundColor: theme.primary }]}>
          <Text style={[todayStyles.tabText, { color: '#FFFFFF' }]}>Today&apos;s Schedule</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={onSelectFullSchedule} style={todayStyles.tab}>
          <Text style={[todayStyles.tabText, { color: theme.secondaryText }]}>My Full Schedule</Text>
        </Pressable>
      </View>

      <View style={todayStyles.statsRow}>
        <TodayStat value={entries.length} label="Batches today" theme={theme} />
        <TodayStat value={roomCount} label="Rooms" theme={theme} />
        <TodayStat value={`${activeEntry ? 1 : 0} of ${entries.length}`} label="In progress" theme={theme} />
      </View>

      {loading ? (
        <ScheduleStateCard title="Loading today’s schedule…" theme={theme} />
      ) : error ? (
        <ScheduleStateCard title="Schedule unavailable" body={error} actionLabel="Retry" onAction={onRetry} theme={theme} />
      ) : !entries.length ? (
        <ScheduleStateCard title="No examination schedule" body="There are no batches scheduled for today." theme={theme} />
      ) : (
        <>
          {activeEntry ? (
            <View>
              <ScheduleSectionLabel label="HAPPENING NOW" active theme={theme} />
              <View style={[todayStyles.heroCard, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
                <View style={todayStyles.cardTopRow}>
                  <SchedulePill label="In progress" background={theme.successBackground} color={theme.successText} />
                  <Text style={[todayStyles.countdown, { color: theme.secondaryText }]}>{formatMinutes(activeMinutesLeft)} left</Text>
                </View>
                <Text style={[todayStyles.heroTime, { color: theme.text }]}>{activeEntry.session.timeLabel}</Text>
                <Text style={[todayStyles.batchMeta, { color: theme.secondaryText }]}>{activeEntry.session.batchNumber} · {schedulePeriod(activeEntry)}</Text>
                <View style={todayStyles.heroStatsRow}>
                  <TodayMetric icon={<MapPin size={20} color={theme.primary} />} value={entryRoomsLabel(activeEntry)} label="Assigned" theme={theme} />
                  <TodayMetric icon={<Users size={20} color={theme.primary} />} value={String(activeEntry.session.registeredStudents ?? 0)} label="Examinees" theme={theme} />
                </View>
                <ScheduleOpenButton entry={activeEntry} action={actionFor(activeEntry)} onOpen={onOpen} theme={theme} />
              </View>
            </View>
          ) : null}

          {nextEntry ? (
            <View style={nextStartsNewPeriod ? todayStyles.periodBreak : undefined}>
              <ScheduleSectionLabel label="UP NEXT" theme={theme} />
              <View style={[todayStyles.nextCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={todayStyles.cardTopRow}>
                  <SchedulePill label={`Starts in ${formatMinutes(nextStartsIn)}`} background={theme.warningBackground} color={theme.warningText} />
                  <Text style={[todayStyles.countdown, { color: theme.secondaryText }]}>{entryRoomsLabel(nextEntry)} · {nextEntry.session.registeredStudents ?? 0}</Text>
                </View>
                <Text style={[todayStyles.nextTime, { color: theme.text }]}>{nextEntry.session.timeLabel}</Text>
                <Text style={[todayStyles.batchMeta, { color: theme.secondaryText }]}>{nextEntry.session.batchNumber} · {schedulePeriod(nextEntry)}</Text>
                <ScheduleOpenButton entry={nextEntry} action={actionFor(nextEntry)} onOpen={onOpen} theme={theme} compact />
              </View>
            </View>
          ) : null}

          {completedEntries.length ? (
            <View style={completedStartsNewPeriod ? todayStyles.periodBreak : undefined}>
              <View style={todayStyles.doneHeading}>
                <ScheduleSectionLabel label={`DONE · ${completedEntries.length}`} theme={theme} />
                <Text style={[todayStyles.latestText, { color: theme.secondaryText }]}>Latest first</Text>
              </View>
              <View style={todayStyles.doneList}>
                {completedEntries.map((entry, index) => (
                  <View
                    key={`${entry.schedule.id}:${entry.session.id}`}
                    style={[
                      todayStyles.doneRow,
                      startsNewSchedulePeriod(completedEntries, index) && todayStyles.periodBreak,
                      { backgroundColor: theme.mutedSurface },
                    ]}
                  >
                    <CheckCircle2 size={22} color={theme.secondaryText} />
                    <View style={todayStyles.doneCopy}>
                      <Text style={[todayStyles.doneTime, { color: theme.doneText }]}>{entry.session.timeLabel}</Text>
                      <Text style={[todayStyles.doneMeta, { color: theme.secondaryText }]}>{entry.session.batchNumber} · {entryRoomsLabel(entry)}</Text>
                    </View>
                    <Text style={[todayStyles.doneCount, { color: theme.secondaryText }]}>{entry.session.registeredStudents ?? 0}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function TodayStat({ value, label, theme }: { value: string | number; label: string; theme: ReturnType<typeof useScheduleRedesignTheme> }) {
  return (
    <View style={[todayStyles.statTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[todayStyles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[todayStyles.statLabel, { color: theme.secondaryText }]}>{label}</Text>
    </View>
  );
}

function TodayMetric({ icon, value, label, theme }: { icon: React.ReactNode; value: string; label: string; theme: ReturnType<typeof useScheduleRedesignTheme> }) {
  return (
    <View style={[todayStyles.metricTile, { backgroundColor: theme.primaryTint }]}>
      {icon}
      <View style={todayStyles.metricCopy}>
        <Text style={[todayStyles.metricValue, { color: theme.text }]} numberOfLines={1}>{value}</Text>
        <Text style={[todayStyles.metricLabel, { color: theme.secondaryText }]}>{label}</Text>
      </View>
    </View>
  );
}

function SchedulePill({ label, background, color }: { label: string; background: string; color: string }) {
  return <View style={[todayStyles.pill, { backgroundColor: background }]}><Text style={[todayStyles.pillText, { color }]}>{label}</Text></View>;
}

function ScheduleSectionLabel({ label, active = false, theme }: { label: string; active?: boolean; theme: ReturnType<typeof useScheduleRedesignTheme> }) {
  return <View style={todayStyles.sectionLabelRow}>{active ? <View style={[todayStyles.sectionDot, { backgroundColor: theme.primary }]} /> : null}<Text style={[todayStyles.sectionLabel, { color: active ? theme.primary : theme.secondaryText }]}>{label}</Text></View>;
}

function ScheduleOpenButton({ entry, action, onOpen, theme, compact = false }: { entry: ScheduleEntry; action: { enabled: boolean; label: string; availability: string }; onOpen: (entry: ScheduleEntry) => void; theme: ReturnType<typeof useScheduleRedesignTheme>; compact?: boolean }) {
  const openingTime = formatScheduleOpeningTime({ date: entryDate(entry), startTime: entry.session.startTime, timeLabel: entry.session.timeLabel });
  const label = action.enabled ? action.label : openingTime ? `Opens at ${openingTime}` : 'Not open yet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !action.enabled }}
      disabled={!action.enabled}
      onPress={() => onOpen(entry)}
      style={[todayStyles.openButton, compact && todayStyles.compactOpenButton, { backgroundColor: action.enabled ? theme.primary : theme.disabledBackground }]}
    >
      <Text style={[todayStyles.openButtonText, { color: action.enabled ? '#FFFFFF' : theme.secondaryText }]}>{label}</Text>
    </Pressable>
  );
}

function ScheduleStateCard({ title, body, actionLabel, onAction, theme }: { title: string; body?: string; actionLabel?: string; onAction?: () => void; theme: ReturnType<typeof useScheduleRedesignTheme> }) {
  return (
    <View style={[todayStyles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[todayStyles.stateTitle, { color: theme.text }]}>{title}</Text>
      {body ? <Text style={[todayStyles.stateBody, { color: theme.secondaryText }]}>{body}</Text> : null}
      {actionLabel && onAction ? <Pressable onPress={onAction} style={[todayStyles.retryButton, { borderColor: theme.primary }]}><Text style={[todayStyles.retryText, { color: theme.primary }]}>{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

const todayStyles = StyleSheet.create({
  root: { gap: scheduleRedesignLayout.sectionGap },
  updateBanner: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  updateCopy: { flex: 1, minWidth: 0 },
  updateTitle: { fontSize: 14, fontWeight: '800' },
  updateBody: { fontSize: 12, marginTop: 1 },
  downloadButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  downloadButtonText: { fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  tabs: { borderRadius: 16, padding: 4, flexDirection: 'row', gap: 0 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: { flex: 1, minHeight: 72, borderWidth: 1, borderRadius: 14, padding: 10 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heroCard: { borderWidth: 2, borderRadius: 22, padding: 18, gap: 14 },
  nextCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '700' },
  countdown: { fontSize: 13, fontWeight: '600' },
  heroTime: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  nextTime: { fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.8 },
  batchMeta: { fontSize: 14, fontWeight: '600', marginTop: -8 },
  heroStatsRow: { flexDirection: 'row', gap: 10 },
  metricTile: { flex: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricCopy: { flex: 1, minWidth: 0 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 11 },
  openButton: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  compactOpenButton: { minHeight: 48, borderRadius: 14 },
  openButtonText: { fontSize: 16, fontWeight: '700' },
  doneHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  latestText: { fontSize: 12, marginBottom: 8 },
  doneList: { gap: 8 },
  periodBreak: { marginTop: 8 },
  doneRow: { minHeight: 64, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneCopy: { flex: 1, minWidth: 0 },
  doneTime: { fontSize: 18, fontWeight: '700' },
  doneMeta: { fontSize: 12, marginTop: 2 },
  doneCount: { fontSize: 13, fontWeight: '600' },
  stateCard: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 8 },
  stateTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryText: { fontSize: 13, fontWeight: '800' },
});

const fullStyles = StyleSheet.create({
  root: { gap: scheduleRedesignLayout.sectionGap },
  tabs: { borderRadius: 16, padding: 4, flexDirection: 'row' },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  daySelector: { gap: 9, paddingRight: 4 },
  dayChip: { minWidth: 108, minHeight: 70, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  dayLabel: { fontSize: 14, fontWeight: '800' },
  dayDate: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  assignmentDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  headingCopy: { flex: 1, minWidth: 0 },
  heading: { fontSize: 21, fontWeight: '800' },
  headingDate: { fontSize: 13, marginTop: 3 },
  batchCount: { fontSize: 12, fontWeight: '700' },
  entryList: { gap: 10 },
  periodBreak: { marginTop: 8 },
  rowCard: { borderRadius: 18, padding: 14, flexDirection: 'row', gap: 14 },
  timeBlock: { width: 82, paddingTop: 1 },
  startTime: { fontSize: 24, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
  timePeriod: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 1 },
  endTime: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  fallbackTime: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  rowContent: { flex: 1, minWidth: 0, gap: 10 },
  rowTopLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowCopy: { flex: 1, minWidth: 0 },
  batchName: { fontSize: 18, fontWeight: '800' },
  periodText: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  roomLine: { minHeight: 34, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '700' },
  examineeCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  examineeText: { fontSize: 12, fontWeight: '700' },
  doneHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  latestText: { fontSize: 12, marginBottom: 8 },
  doneRow: { minHeight: 64, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneCopy: { flex: 1, minWidth: 0 },
  doneTime: { fontSize: 18, fontWeight: '700' },
  doneMeta: { fontSize: 12, marginTop: 2 },
  doneCount: { fontSize: 13, fontWeight: '600' },
  hint: { borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

const styles = StyleSheet.create({
  root: { gap: 14 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tabText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  summaryCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryTitle: { fontSize: 14, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  daySelector: { gap: 9, paddingRight: 4 },
  dayChip: { minWidth: 92, minHeight: 68, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9 },
  dayNumber: { fontSize: 13, fontWeight: '900' },
  dayDate: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  assignmentDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  dayHeading: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  dayTitle: { fontSize: 18, fontWeight: '900' },
  daySubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  batchCount: { fontSize: 11, fontWeight: '800' },
  timeline: { gap: 10 },
  periodLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 },
  roomChange: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  roomChangeText: { flex: 1, fontSize: 11, fontWeight: '800' },
  batchCard: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', flexDirection: 'row' },
  timelineRail: { width: 4 },
  batchContent: { flex: 1, minWidth: 0, padding: 13, gap: 11 },
  batchTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  batchName: { fontSize: 15, fontWeight: '900' },
  inlineDetail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  roomPanel: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 11, padding: 10 },
  roomLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  roomValue: { fontSize: 19, fontWeight: '900', marginTop: 1 },
  studentCount: { fontSize: 12, fontWeight: '800' },
  openButton: { minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  openButtonText: { fontSize: 12, fontWeight: '900' },
  emptyCard: { borderWidth: 1, borderRadius: 15, padding: 20, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  emptyBody: { fontSize: 12, fontWeight: '500', lineHeight: 18, textAlign: 'center' },
  retryButton: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryText: { fontSize: 12, fontWeight: '800' },
});
