import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface OptionItem {
  key: string;
  text: string;
}

export interface QuestionItem {
  id: number;
  number: number;
  category: string;
  questionText: string;
  options: OptionItem[];
}

export interface ExamScreenProps {
  initialTheme?: 'dark' | 'light';
  subjectTitle?: string;
  examTitle?: string;
  categoryName?: string;
  questions?: QuestionItem[];
  initialRemainingSeconds?: number;
  initialViolations?: number;
  initialAnswers?: Record<number, string>;
  onSubmit?: (answers: Record<number, string>) => void;
}

interface ThemeColors {
  background: string;
  cardBackground: string;
  cardBorder: string;
  accent: string;
  accentLight: string;
  selectedOptionFill: string;
  selectedOptionBorder: string;
  unselectedOptionFill: string;
  unselectedBadgeCircle: string;
  selectedBadgeCircle: string;
  selectedBadgeText: string;
  unselectedBadgeText: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  divider: string;
  topBarChipBg: string;
  topBarChipText: string;
  violationsChipBg: string;
  violationsChipText: string;
  progressTrack: string;
  progressFill: string;
  submitButtonBg: string;
  submitButtonText: string;
  controlIconColor: string;
  selectedOptionText: string;
  unselectedOptionText: string;
}

const darkTheme: ThemeColors = {
  background: '#14141F',
  cardBackground: '#1E1E2C',
  cardBorder: '#28283C',
  accent: '#7C6AF5',
  accentLight: '#A492F7',
  selectedOptionFill: '#3A3560',
  selectedOptionBorder: '#7C6AF5',
  unselectedOptionFill: '#2A2A38',
  unselectedBadgeCircle: '#1E1E2C',
  selectedBadgeCircle: '#7C6AF5',
  selectedBadgeText: '#FFFFFF',
  unselectedBadgeText: '#8A8A9E',
  textPrimary: '#FFFFFF',
  textSecondary: '#D2D2E2',
  muted: '#8A8A9E',
  divider: '#2B2B3E',
  topBarChipBg: '#261E48',
  topBarChipText: '#A492F7',
  violationsChipBg: '#202133',
  violationsChipText: '#8A8A9E',
  progressTrack: '#262638',
  progressFill: '#7C6AF5',
  submitButtonBg: '#7C6AF5',
  submitButtonText: '#FFFFFF',
  controlIconColor: '#C4C4D8',
  selectedOptionText: '#FFFFFF',
  unselectedOptionText: '#D2D2E2',
};

const lightTheme: ThemeColors = {
  background: '#F3F2FA',
  cardBackground: '#FFFFFF',
  cardBorder: '#E8E7F3',
  accent: '#7C6AF5',
  accentLight: '#6D5AE6',
  selectedOptionFill: '#EDE9FE',
  selectedOptionBorder: '#7C6AF5',
  unselectedOptionFill: '#EAEAF2',
  unselectedBadgeCircle: '#D9D8E8',
  selectedBadgeCircle: '#7C6AF5',
  selectedBadgeText: '#FFFFFF',
  unselectedBadgeText: '#5A5A72',
  textPrimary: '#1A1A2E',
  textSecondary: '#222234',
  muted: '#8A8A9E',
  divider: '#E2E1EE',
  topBarChipBg: '#EDE9FE',
  topBarChipText: '#6D5AE6',
  violationsChipBg: '#E6E5F2',
  violationsChipText: '#5A5A72',
  progressTrack: '#E0DFEC',
  progressFill: '#7C6AF5',
  submitButtonBg: '#7C6AF5',
  submitButtonText: '#FFFFFF',
  controlIconColor: '#2C2C40',
  selectedOptionText: '#1A1A2E',
  unselectedOptionText: '#222234',
};

const SAMPLE_QUESTIONS: QuestionItem[] = [
  {
    id: 1,
    number: 1,
    category: 'Algebra',
    questionText: 'If 3x + 7 = 22, what is the value of x?',
    options: [
      { key: 'A', text: '3' },
      { key: 'B', text: '5' },
      { key: 'C', text: '7' },
      { key: 'D', text: '9' },
    ],
  },
  {
    id: 2,
    number: 2,
    category: 'Algebra',
    questionText: 'Which expression is equivalent to (x + 4)(x - 4)?',
    options: [
      { key: 'A', text: 'x² - 16' },
      { key: 'B', text: 'x² + 16' },
      { key: 'C', text: 'x² - 8x - 16' },
      { key: 'D', text: 'x² + 8x - 16' },
    ],
  },
  {
    id: 3,
    number: 3,
    category: 'Algebra',
    questionText: 'Solve for y in the equation 2y - 5 = 11.',
    options: [
      { key: 'A', text: '6' },
      { key: 'B', text: '7' },
      { key: 'C', text: '8' },
      { key: 'D', text: '9' },
    ],
  },
  {
    id: 4,
    number: 4,
    category: 'Algebra',
    questionText: 'What are the roots of the quadratic equation x² - 5x + 6 = 0?',
    options: [
      { key: 'A', text: 'x = 2 and x = 3' },
      { key: 'B', text: 'x = -2 and x = -3' },
      { key: 'C', text: 'x = 1 and x = 6' },
      { key: 'D', text: 'x = -1 and x = -6' },
    ],
  },
  {
    id: 5,
    number: 5,
    category: 'Algebra',
    questionText: 'Simplify the algebraic expression: (2x³)(4x²)',
    options: [
      { key: 'A', text: '6x⁵' },
      { key: 'B', text: '8x⁵' },
      { key: 'C', text: '8x⁶' },
      { key: 'D', text: '6x⁶' },
    ],
  },
  {
    id: 6,
    number: 6,
    category: 'Algebra',
    questionText: 'If f(x) = 2x² - 3x + 4, what is the value of f(2)?',
    options: [
      { key: 'A', text: '4' },
      { key: 'B', text: '6' },
      { key: 'C', text: '8' },
      { key: 'D', text: '10' },
    ],
  },
  {
    id: 7,
    number: 7,
    category: 'Algebra',
    questionText: 'What is the slope of the line represented by 3x - 6y = 12?',
    options: [
      { key: 'A', text: '1/2' },
      { key: 'B', text: '-1/2' },
      { key: 'C', text: '2' },
      { key: 'D', text: '-2' },
    ],
  },
  {
    id: 8,
    number: 8,
    category: 'Algebra',
    questionText: 'Factor completely: 4x² - 9',
    options: [
      { key: 'A', text: '(2x - 3)²' },
      { key: 'B', text: '(2x + 3)(2x - 3)' },
      { key: 'C', text: '(4x - 9)(x + 1)' },
      { key: 'D', text: '(2x - 9)(2x + 1)' },
    ],
  },
  {
    id: 9,
    number: 9,
    category: 'Algebra',
    questionText: 'Find x: 5^(x - 1) = 125',
    options: [
      { key: 'A', text: '2' },
      { key: 'B', text: '3' },
      { key: 'C', text: '4' },
      { key: 'D', text: '5' },
    ],
  },
];

const FONT_MIN = 0.85;
const FONT_MAX = 1.30;
const FONT_DEFAULT = 1.0;
const FONT_STEP = 0.1;

function formatMMSS(totalSeconds: number): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.max(0, totalSeconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** 1. Top Bar Component */
interface TopBarProps {
  theme: ThemeColors;
  isDark: boolean;
  categoryName: string;
  onToggleTheme: () => void;
  onDecreaseFont: () => void;
  onResetFont: () => void;
  onIncreaseFont: () => void;
}

function TopBar({
  theme,
  isDark,
  categoryName,
  onToggleTheme,
  onDecreaseFont,
  onResetFont,
  onIncreaseFont,
}: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <View style={[styles.categoryChip, { backgroundColor: theme.topBarChipBg }]}>
        <Text style={[styles.categoryChipText, { color: theme.topBarChipText }]}>
          Category: {categoryName}
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={onDecreaseFont}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel="Decrease font size"
        >
          <Text style={[styles.fontBtnText, { color: theme.controlIconColor }]}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onResetFont}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel="Reset font size"
        >
          <Text style={[styles.fontBtnTextBold, { color: theme.controlIconColor }]}>A</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onIncreaseFont}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel="Increase font size"
        >
          <Text style={[styles.fontBtnText, { color: theme.controlIconColor }]}>+</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleTheme}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel="Toggle dark/light theme"
        >
          <Ionicons
            name={isDark ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={theme.controlIconColor}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** 2. Status Row Component */
interface StatusRowProps {
  theme: ThemeColors;
  violations: number;
  remainingSeconds: number;
}

function StatusRow({ theme, violations, remainingSeconds }: StatusRowProps) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.violationsChip, { backgroundColor: theme.violationsChipBg }]}>
        <Text style={[styles.violationsText, { color: theme.violationsChipText }]}>
          Violations: {violations}
        </Text>
      </View>

      <View style={styles.timerAbsoluteCenter} pointerEvents="none">
        <Text style={[styles.timerText, { color: theme.textPrimary }]}>
          {formatMMSS(remainingSeconds)}
        </Text>
      </View>
    </View>
  );
}

/** 3. Header Block Component */
interface ExamHeaderProps {
  theme: ThemeColors;
  subjectTitle: string;
  examTitle: string;
  answeredCount: number;
  totalCount: number;
}

function ExamHeader({
  theme,
  subjectTitle,
  examTitle,
  answeredCount,
  totalCount,
}: ExamHeaderProps) {
  return (
    <View style={styles.headerBlock}>
      <Text style={[styles.subjectLabel, { color: theme.accentLight }]}>
        {subjectTitle}
      </Text>
      <View style={styles.titleRow}>
        <Text style={[styles.examTitle, { color: theme.textPrimary }]}>
          {examTitle}
        </Text>
        <Text style={[styles.progressAnsweredText, { color: theme.muted }]}>
          {answeredCount}/{totalCount} answered
        </Text>
      </View>
    </View>
  );
}

/** 4. Section Divider Component */
interface SectionDividerProps {
  theme: ThemeColors;
  title: string;
}

function SectionDivider({ theme, title }: SectionDividerProps) {
  return (
    <View style={styles.sectionDividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
      <Text style={[styles.sectionDividerText, { color: theme.muted }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
    </View>
  );
}

/** 5. Question Card Component */
interface QuestionCardProps {
  theme: ThemeColors;
  isDark: boolean;
  question: QuestionItem;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  fontScale: number;
  onSelectOption: (questionId: number, optionKey: string) => void;
}

function QuestionCard({
  theme,
  isDark,
  question,
  totalQuestions,
  selectedAnswer,
  fontScale,
  onSelectOption,
}: QuestionCardProps) {
  return (
    <View
      style={[
        styles.questionCard,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder,
        },
        isDark ? styles.cardShadowDark : styles.cardShadowLight,
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.questionNumberText, { color: theme.muted }]}>
          Q. {question.number}/{totalQuestions}
        </Text>
        <Text style={[styles.categoryTagText, { color: theme.accent }]}>
          {question.category}
        </Text>
      </View>

      <Text
        style={[
          styles.questionText,
          {
            color: theme.textPrimary,
            fontSize: 18 * fontScale,
            lineHeight: 25 * fontScale,
          },
        ]}
      >
        {question.questionText}
      </Text>

      <View style={styles.optionsStack}>
        {question.options.map((opt) => {
          const isSelected = selectedAnswer === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.7}
              onPress={() => onSelectOption(question.id, opt.key)}
              style={[
                styles.optionPill,
                {
                  backgroundColor: isSelected
                    ? theme.selectedOptionFill
                    : theme.unselectedOptionFill,
                  borderColor: isSelected
                    ? theme.selectedOptionBorder
                    : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.badgeCircle,
                  {
                    backgroundColor: isSelected
                      ? theme.selectedBadgeCircle
                      : theme.unselectedBadgeCircle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeLetter,
                    {
                      color: isSelected
                        ? theme.selectedBadgeText
                        : theme.unselectedBadgeText,
                    },
                  ]}
                >
                  {opt.key}
                </Text>
              </View>
              <Text
                style={[
                  styles.optionText,
                  {
                    color: isSelected
                      ? theme.selectedOptionText
                      : theme.unselectedOptionText,
                    fontSize: 15 * fontScale,
                    fontWeight: isSelected ? '700' : '600',
                  },
                ]}
              >
                {opt.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** 6. Sticky Footer Bar Component */
interface FooterBarProps {
  theme: ThemeColors;
  answeredCount: number;
  totalQuestions: number;
  bottomInset: number;
  onSubmit: () => void;
}

function FooterBar({
  theme,
  answeredCount,
  totalQuestions,
  bottomInset,
  onSubmit,
}: FooterBarProps) {
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <View
      style={[
        styles.footerBar,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.divider,
          paddingBottom: Math.max(bottomInset, 14),
        },
      ]}
    >
      <View style={styles.progressContainer}>
        <Text style={[styles.progressLabel, { color: theme.muted }]}>Progress</Text>
        <View style={[styles.progressBarTrack, { backgroundColor: theme.progressTrack }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: theme.progressFill,
                width: `${progressPercent}%`,
              },
            ]}
          />
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onSubmit}
        style={[styles.submitButton, { backgroundColor: theme.submitButtonBg }]}
      >
        <Ionicons name="paper-plane" size={16} color={theme.submitButtonText} />
        <Text style={[styles.submitButtonText, { color: theme.submitButtonText }]}>
          Submit Exam
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Main ExamScreen Component */
export default function ExamScreen({
  initialTheme = 'dark',
  subjectTitle = 'Mathematics',
  examTitle = 'Final Examination',
  categoryName = 'Algebra',
  questions = SAMPLE_QUESTIONS,
  initialRemainingSeconds = 3569, // 59:29 matching screenshot
  initialViolations = 0,
  initialAnswers = { 1: 'A' }, // 1/9 answered initially matching screenshot
  onSubmit,
}: ExamScreenProps) {
  const insets = useSafeAreaInsets();

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(initialTheme);
  const [answers, setAnswers] = useState<Record<number, string>>(initialAnswers);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemainingSeconds);
  const [fontScale, setFontScale] = useState<number>(FONT_DEFAULT);
  const [violations] = useState<number>(initialViolations);

  const isDark = themeMode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  // Countdown timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Theme toggle
  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Font scale controls
  const handleDecreaseFont = useCallback(() => {
    setFontScale((prev) => Math.max(FONT_MIN, Number((prev - FONT_STEP).toFixed(2))));
  }, []);

  const handleResetFont = useCallback(() => {
    setFontScale(FONT_DEFAULT);
  }, []);

  const handleIncreaseFont = useCallback(() => {
    setFontScale((prev) => Math.min(FONT_MAX, Number((prev + FONT_STEP).toFixed(2))));
  }, []);

  // Option selection
  const handleSelectOption = useCallback((questionId: number, optionKey: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionKey,
    }));
  }, []);

  // Submit handler
  const totalQuestions = questions.length;
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  const handleSubmit = useCallback(() => {
    Alert.alert(
      'Submit Examination',
      `You have answered ${answeredCount} of ${totalQuestions} questions.\n\nAre you sure you want to submit your examination now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: () => {
            if (onSubmit) {
              onSubmit(answers);
            } else {
              Alert.alert('Submitted', 'Your examination has been submitted successfully.');
            }
          },
        },
      ],
    );
  }, [answeredCount, totalQuestions, answers, onSubmit]);

  const renderHeader = () => (
    <View>
      <TopBar
        theme={theme}
        isDark={isDark}
        categoryName={categoryName}
        onToggleTheme={toggleTheme}
        onDecreaseFont={handleDecreaseFont}
        onResetFont={handleResetFont}
        onIncreaseFont={handleIncreaseFont}
      />

      <StatusRow
        theme={theme}
        violations={violations}
        remainingSeconds={remainingSeconds}
      />

      <ExamHeader
        theme={theme}
        subjectTitle={subjectTitle}
        examTitle={examTitle}
        answeredCount={answeredCount}
        totalCount={totalQuestions}
      />

      <SectionDivider theme={theme} title={categoryName} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <FlatList
        data={questions}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <QuestionCard
            theme={theme}
            isDark={isDark}
            question={item}
            totalQuestions={totalQuestions}
            selectedAnswer={answers[item.id]}
            fontScale={fontScale}
            onSelectOption={handleSelectOption}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 10) + 6 : 8,
            paddingBottom: 110, // Buffer for sticky footer
          },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <FooterBar
        theme={theme}
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        bottomInset={insets.bottom}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
  },

  /** 1. Top Bar */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  fontBtnText: {
    fontSize: 17,
    fontWeight: '700',
  },
  fontBtnTextBold: {
    fontSize: 14,
    fontWeight: '800',
  },

  /** 2. Status Row */
  statusRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
    minHeight: 38,
  },
  violationsChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  violationsText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timerAbsoluteCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /** 3. Header Block */
  headerBlock: {
    marginTop: 6,
    marginBottom: 16,
  },
  subjectLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  examTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  progressAnsweredText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },

  /** 4. Section Divider */
  sectionDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  sectionDividerText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginHorizontal: 14,
  },

  /** 5. Question Card */
  questionCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
  },
  cardShadowDark: {
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardShadowLight: {
    elevation: 3,
    shadowColor: '#6B6894',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionNumberText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryTagText: {
    fontSize: 13,
    fontWeight: '700',
  },
  questionText: {
    fontWeight: '800',
    marginBottom: 18,
  },
  optionsStack: {
    gap: 10,
  },
  optionPill: {
    minHeight: 52,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  badgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLetter: {
    fontSize: 14,
    fontWeight: '800',
  },
  optionText: {
    marginLeft: 14,
    flex: 1,
  },

  /** 6. Sticky Footer Bar */
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressContainer: {
    flex: 1,
    marginRight: 16,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  submitButton: {
    borderRadius: 9999,
    height: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#7C6AF5',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
});

