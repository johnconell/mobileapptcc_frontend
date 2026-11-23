import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Layers, List } from 'lucide-react-native';

import {
  BottomBar,
  ExamViewToggle,
  ExamHeader,
  QuestionCard,
  QuestionNavigatorSheet,
  SubmitConfirmDialog,
  Row,
  type CategoryItem,
} from '@/shared/components/ui';
import { ExamQuestionWorkspace, type ExamQuestionWorkspaceHandle } from '@/features/examinations/components/ExamQuestionWorkspace';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { PracticeModeChip } from '@/features/practice/components/PracticeModeChip';
import {
  PracticeTutorialModalHost,
  usePracticeTutorialTarget,
} from '@/features/practice/components/PracticeTutorialProvider';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { buildCategoryProgress } from '@/features/examinations/components/ExamCategoryNav';
import { isConfirmPhrase } from '@/features/examinations/services/submitGate';
import type { ChoiceKey, Question } from '@/shared/types';

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

function PracticeExamScreenInner() {
  const router = useRouter();
  const insetsContext = useContext(SafeAreaInsetsContext);
  const insets = insetsContext ?? { top: 16, bottom: 16, left: 0, right: 0 };
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { theme, isDark } = useThemeTokens();

  const flatListRef = useRef<ExamQuestionWorkspaceHandle>(null);
  const timerTutorial = usePracticeTutorialTarget('tutorial-timer');
  const viewToggleTutorial = usePracticeTutorialTarget('tutorial-view-toggle');
  const choiceTutorial = usePracticeTutorialTarget('tutorial-first-choice');
  const flagTutorial = usePracticeTutorialTarget('tutorial-mark-not-sure');
  const questionsTutorial = usePracticeTutorialTarget('tutorial-questions-button');
  const submitTutorial = usePracticeTutorialTarget('tutorial-submit');
  const questionFiveTutorial = usePracticeTutorialTarget('tutorial-question-5', 'modal');

  // Store state & selectors
  const questions = usePracticeStore((s) => s.questions);
  const answers = usePracticeStore((s) => s.answers);
  const flags = usePracticeStore((s) => s.flags);
  const currentIndex = usePracticeStore((s) => s.currentIndex);
  const setCurrentIndex = usePracticeStore((s) => s.setCurrentIndex);
  const remainingSeconds = usePracticeStore((s) => s.remainingSeconds);
  const totalDurationSeconds = usePracticeStore((s) => s.totalDurationSeconds);
  const decrementTimer = usePracticeStore((s) => s.decrementTimer);
  const selectAnswer = usePracticeStore((s) => s.selectAnswer);
  const toggleFlag = usePracticeStore((s) => s.toggleFlag);
  const navMode = usePracticeStore((s) => s.navMode);
  const setNavMode = usePracticeStore((s) => s.setNavMode);
  const submitPractice = usePracticeStore((s) => s.submitPractice);
  const submittedAt = usePracticeStore((s) => s.submittedAt);

  // Tutorial state
  const setTutorialPaused = usePracticeStore((s) => s.setTutorialPaused);
  const completeTutorial = usePracticeStore((s) => s.completeTutorial);
  const tutorialIndex = usePracticeStore((s) => s.tutorialIndex);
  const tutorialActive = usePracticeStore((s) => s.tutorialActive);
  const skipTutorial = usePracticeStore((s) => s.skipTutorial);

  // Modals & Overlay Conflict Prevention
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null | undefined>(undefined);
  const autoSubmitStarted = useRef(false);


  // Independent practice timer
  useEffect(() => {
    const timer = setInterval(() => {
      decrementTimer();
    }, 1000);
    return () => clearInterval(timer);
  }, [decrementTimer]);

  useEffect(() => {
    if (remainingSeconds > 0 || submittedAt || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    completeTutorial();
    submitPractice();
    router.replace('/practice/submitting' as any);
  }, [remainingSeconds, submittedAt, completeTutorial, submitPractice, router]);

  // Compute categories
  const categories = useMemo(() => buildCategoryProgress(questions, answers), [questions, answers]);
  const categoriesList: CategoryItem[] = useMemo(() => {
    return categories.map((c) => ({
      key: c.key,
      name: c.label || c.key,
      answered: c.answered,
      total: c.total,
    }));
  }, [categories]);

  const total = questions.length;
  const answered = useMemo(
    () => Object.values(answers).filter((a) => a && a.selectedAnswer != null).length,
    [answers],
  );
  const unanswered = Math.max(0, total - answered);
  const flaggedCount = useMemo(() => Object.values(flags).filter(Boolean).length, [flags]);

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, total - 1));
  const activeQuestion = questions[safeIndex] ?? null;

  // Question navigation
  const handleJumpToQuestion = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      if (navMode === 'scroll') {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex(index, true);
        }, 50);
      }
    },
    [navMode, setCurrentIndex],
  );

  const handleSelectCategory = useCallback(
    (catKey: string | null) => {
      setSelectedCategoryFilter(catKey);
      if (catKey) {
        const targetIdx = questions.findIndex((q) => categoryKeyOf(q) === catKey);
        if (targetIdx >= 0) {
          handleJumpToQuestion(targetIdx);
        }
      }
    },
    [questions, handleJumpToQuestion],
  );

  // Submission handler
  const handleConfirmSubmit = (typedPhrase: string) => {
    if (isConfirmPhrase(typedPhrase)) {
      setSubmitConfirmOpen(false);
      completeTutorial();
      submitPractice();
      router.replace('/practice/submitting' as any);
    }
  };

  const handleReviewUnanswered = () => {
    setSubmitConfirmOpen(false);
    setNavigatorOpen(true);
    setTutorialPaused(false);
  };

  const openNavigator = () => {
    setSubmitConfirmOpen(false);
    setNavigatorOpen(true);
  };

  const closeNavigator = () => {
    setNavigatorOpen(false);
    if (tutorialActive && tutorialIndex === 9) skipTutorial();
  };

  const openSubmitConfirmation = () => {
    setNavigatorOpen(false);
    setSubmitConfirmOpen(true);
  };

  const closeSubmitConfirmation = () => {
    setSubmitConfirmOpen(false);
    setTutorialPaused(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={true} />

      {/* 1. Exam Header (Title, Category Dropdown, Timer, Font A-/A+, Light/Dark Switch) */}
      <View style={{ paddingTop: Math.max(insets.top, 8) }}>
        <ExamHeader
          remainingSeconds={remainingSeconds}
          totalDurationSeconds={totalDurationSeconds}
          timerTestID="tutorial-timer"
          timerTutorialRef={timerTutorial.ref}
          categories={categoriesList}
          selectedCategory={
            selectedCategoryFilter === undefined
              ? activeQuestion
                ? categoryKeyOf(activeQuestion)
                : null
              : selectedCategoryFilter
          }
          onSelectCategory={handleSelectCategory}
          disabled={false}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}><PracticeModeChip /></View>

      {/* 2. Info Row: "X of 25 answered" on left, "Scroll | One by one" on right */}
      <Row style={styles.infoRow}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.infoAnsweredText, { color: theme.textSecondary }]}
        >
          <Text style={[styles.infoAnsweredBold, { color: theme.text }]}>{answered}</Text>
          {` of ${total} answered`}
        </Text>

        <ExamViewToggle
          testID="tutorial-view-toggle"
          tutorialRef={viewToggleTutorial.ref}
          onTutorialPress={viewToggleTutorial.run}
          mode={navMode}
          onToggle={() => setNavMode(navMode === 'scroll' ? 'one_at_a_time' : 'scroll')}
        />
      </Row>

      {/* 3. Question Area: same workspace used by the real examination */}
      <ExamQuestionWorkspace
        ref={flatListRef}
        questions={questions}
        currentIndex={safeIndex}
        navMode={navMode}
        onTutorialScrollEnd={viewToggleTutorial.remeasure}
        onCurrentIndexChange={setCurrentIndex}
        onVisibleIndexChange={(index) => setCurrentIndex(index)}
        renderQuestion={(question, index) => (
          <QuestionCard
            question={question}
            questionNumber={question.number ?? index + 1}
            totalQuestions={total}
            selectedAnswer={answers[question.id]?.selectedAnswer ?? null}
            isFlagged={Boolean(flags[question.id])}
            onSelect={(choice) => selectAnswer(question.id, choice)}
            onToggleFlag={() => toggleFlag(question.id)}
            firstChoiceRef={index === 0 ? choiceTutorial.ref : undefined}
            firstChoiceOnPress={index === 0 ? choiceTutorial.run : undefined}
            flagButtonRef={index === 0 ? flagTutorial.ref : undefined}
            flagButtonOnPress={index === 0 ? flagTutorial.run : undefined}
            disabled={false}
          />
        )}
      />

      {/* 4. Fixed Bottom Bar */}
      <BottomBar
        answeredCount={answered}
        totalQuestions={total}
        flaggedCount={flaggedCount}
        onOpenQuestions={openNavigator}
        onSubmit={openSubmitConfirmation}
        questionsTutorialRef={questionsTutorial.ref}
        onQuestionsTutorialPress={questionsTutorial.run}
        submitTutorialRef={submitTutorial.ref}
        onSubmitTutorialPress={submitTutorial.run}
        disabled={false}
      />

      {/* Practice Question Navigator Sheet with Question 5 Spotlight */}
      <QuestionNavigatorSheet
        visible={navigatorOpen}
        onClose={closeNavigator}
        questions={questions}
        answers={answers}
        flags={flags}
        currentIndex={safeIndex}
        onJumpToQuestion={(index) => {
          if (index === 4) questionFiveTutorial.run(() => handleJumpToQuestion(index));
          else handleJumpToQuestion(index);
        }}
        tutorialQuestionNumber={5}
        tutorialQuestionRef={questionFiveTutorial.ref}
        tutorialOverlay={<PracticeTutorialModalHost />}
        tutorialOnScroll={questionFiveTutorial.remeasure}
      />

      {/* Submit Confirmation Dialog */}
      <SubmitConfirmDialog
        visible={submitConfirmOpen}
        answeredCount={answered}
        unansweredCount={unanswered}
        flaggedCount={flaggedCount}
        totalQuestions={total}
        onClose={closeSubmitConfirmation}
        onReview={handleReviewUnanswered}
        onSubmit={handleConfirmSubmit}
      />

      {/* ─── INTERACTIVE ONBOARDING TUTORIAL GATED STEPS ─── */}
    </View>
  );
}

export default function PracticeExamScreen() {
  return <PracticeExamScreenInner />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  infoAnsweredText: {
    fontSize: 13,
    flexShrink: 1,
    minWidth: 0,
  },
  infoAnsweredBold: {
    fontWeight: '700',
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  modeSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 5,
  },
  modeSegmentText: {
    fontSize: 12,
  },
  questionArea: {
    flex: 1,
  },
  scrollListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  oneByOneScroll: {
    flex: 1,
  },
  oneByOneContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  oneByOneNavControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
  },
  oneByOneNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  oneByOneNavBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  oneByOneCenterIndex: {
    fontSize: 13,
    fontWeight: '500',
  },
  modeSwitchPointerWrapper: {
    position: 'absolute',
    top: -46,
    right: 0,
    alignItems: 'center',
    zIndex: 999999,
  },
  navBtnPointerWrapper: {
    position: 'absolute',
    top: -46,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999999,
  },
});
