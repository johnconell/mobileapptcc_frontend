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
  ExamHeader,
  QuestionCard,
  SubmitConfirmDialog,
  Row,
  type CategoryItem,
} from '@/shared/components/ui';
import { PracticeQuestionNavigatorSheet } from '@/features/practice/components/PracticeQuestionNavigatorSheet';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeTutorialOverlay } from '@/features/practice/components/PracticeTutorialOverlay';
import { PracticePointerArrow } from '@/features/practice/components/PracticePointerArrow';
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

  const flatListRef = useRef<FlatList<Question>>(null);
  const modeSwitchRef = useRef<View>(null);

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

  // Tutorial state
  const tutorialActive = usePracticeStore((s) => s.tutorialActive);
  const tutorialStep = usePracticeStore((s) => s.tutorialStep);
  const setTutorialStep = usePracticeStore((s) => s.setTutorialStep);
  const nextTutorialStep = usePracticeStore((s) => s.nextTutorialStep);
  const skipTutorial = usePracticeStore((s) => s.skipTutorial);
  const visitedQuestions = usePracticeStore((s) => s.visitedQuestions);
  const hasFlaggedQ1 = usePracticeStore((s) => s.hasFlaggedQ1);

  // Modals & Overlay Conflict Prevention
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null | undefined>(undefined);

  const isOverlayActive = submitConfirmOpen || navigatorOpen;
  const isInteractiveTutorialActive = tutorialActive && !isOverlayActive;

  // Independent practice timer
  useEffect(() => {
    const timer = setInterval(() => {
      decrementTimer();
    }, 1000);
    return () => clearInterval(timer);
  }, [decrementTimer]);

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
      if (tutorialActive && tutorialStep === 'jump_question_5') {
        setTutorialStep('review_submit');
      }
      if (navMode === 'scroll') {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }, 50);
      }
    },
    [navMode, setCurrentIndex, tutorialActive, tutorialStep, setTutorialStep],
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
      skipTutorial();
      submitPractice();
      router.replace('/practice/submitting' as any);
    }
  };

  const handleReviewUnanswered = () => {
    setSubmitConfirmOpen(false);
    setNavigatorOpen(true);
  };

  const openNavigator = () => {
    setSubmitConfirmOpen(false);
    setNavigatorOpen(true);
    // If student was guided to open navigator
    if (tutorialActive && tutorialStep === 'open_navigator') {
      setTutorialStep('jump_question_5');
    }
  };

  const openSubmitConfirmation = () => {
    setNavigatorOpen(false);
    setSubmitConfirmOpen(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={true} />

      {/* 1. Exam Header (Title, Category Dropdown, Timer, Font A-/A+, Light/Dark Switch) */}
      <View style={{ paddingTop: Math.max(insets.top, 8) }}>
        <ExamHeader
          remainingSeconds={remainingSeconds}
          totalDurationSeconds={totalDurationSeconds}
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

      {/* Practice Mode Notice Chip */}
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <PracticeBadge
          label="PRACTICE MODE · 25 QUESTIONS"
          sublabel="Try all navigation, review, and submission controls"
        />
      </View>

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

        {/* Labeled Mode Switch: Scroll / One by one with direct pointing arrow */}
        <View style={{ position: 'relative' }}>
          {tutorialActive && tutorialStep === 'mode_toggle' && (
            <View style={styles.modeSwitchPointerWrapper} pointerEvents="none">
              <PracticePointerArrow
                direction="down"
                label="SWITCH VIEW (Scroll / One by one)"
              />
            </View>
          )}
          <View
            style={[
              styles.modeSwitch,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
          <Pressable
            onPress={() => setNavMode('scroll')}
            accessibilityRole="button"
            accessibilityLabel="Scroll mode"
            style={[
              styles.modeSegment,
              navMode === 'scroll' && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <List
              size={14}
              color={navMode === 'scroll' ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.modeSegmentText,
                {
                  color: navMode === 'scroll' ? theme.onAccent : theme.textSecondary,
                  fontWeight: navMode === 'scroll' ? '600' : '400',
                },
              ]}
            >
              Scroll
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setNavMode('one_at_a_time')}
            accessibilityRole="button"
            accessibilityLabel="One by one mode"
            style={[
              styles.modeSegment,
              navMode === 'one_at_a_time' && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Layers
              size={14}
              color={navMode === 'one_at_a_time' ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.modeSegmentText,
                {
                  color: navMode === 'one_at_a_time' ? theme.onAccent : theme.textSecondary,
                  fontWeight: navMode === 'one_at_a_time' ? '600' : '400',
                },
              ]}
            >
              One by one
            </Text>
          </Pressable>
        </View>
      </View>
    </Row>

      {/* 3. Question Area */}
      <View style={styles.questionArea}>
        {navMode === 'scroll' ? (
          <FlatList
            ref={flatListRef}
            data={questions}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <QuestionCard
                question={item}
                questionNumber={item.number ?? index + 1}
                totalQuestions={total}
                selectedAnswer={answers[item.id]?.selectedAnswer ?? null}
                isFlagged={Boolean(flags[item.id])}
                onSelect={(choice) => selectAnswer(item.id, choice)}
                onToggleFlag={() => toggleFlag(item.id)}
                tutorialPointer={
                  isInteractiveTutorialActive && (item.id === 'p1' || index === 0)
                    ? tutorialStep === 'select_choice'
                      ? 'choice'
                      : tutorialStep === 'flag_question'
                        ? 'flag'
                        : null
                    : null
                }
                disabled={false}
              />
            )}
            contentContainerStyle={styles.scrollListContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <ScrollView
            style={styles.oneByOneScroll}
            contentContainerStyle={styles.oneByOneContent}
            showsVerticalScrollIndicator={false}
          >
            {activeQuestion ? (
              <>
                <View>
                  <QuestionCard
                    question={activeQuestion}
                    questionNumber={activeQuestion.number ?? safeIndex + 1}
                    totalQuestions={total}
                    selectedAnswer={answers[activeQuestion.id]?.selectedAnswer ?? null}
                    isFlagged={Boolean(flags[activeQuestion.id])}
                    onSelect={(choice) => selectAnswer(activeQuestion.id, choice)}
                    onToggleFlag={() => toggleFlag(activeQuestion.id)}
                    tutorialPointer={
                      isInteractiveTutorialActive && safeIndex === 0
                        ? tutorialStep === 'select_choice'
                          ? 'choice'
                          : tutorialStep === 'flag_question'
                            ? 'flag'
                            : null
                        : null
                    }
                    disabled={false}
                  />
                </View>

                {/* Previous & Next Navigation Controls */}
                <Row style={styles.oneByOneNavControls}>
                  <View style={{ position: 'relative' }}>
                    {isInteractiveTutorialActive && tutorialStep === 'return_marked' && (
                      <View style={styles.navBtnPointerWrapper} pointerEvents="none">
                        <PracticePointerArrow
                          direction="down"
                          label="TAP PREVIOUS (BACK TO Q1)"
                        />
                      </View>
                    )}
                    <Pressable
                      onPress={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                      disabled={safeIndex <= 0}
                      accessibilityRole="button"
                      accessibilityLabel="Previous question"
                      style={[
                        styles.oneByOneNavBtn,
                        {
                          backgroundColor: theme.surfaceAlt,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ChevronLeft size={18} color={theme.accentText} strokeWidth={2.2} />
                      <Text numberOfLines={1} style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                        Previous
                      </Text>
                    </Pressable>
                  </View>

                  <Text numberOfLines={1} style={[styles.oneByOneCenterIndex, { color: theme.textSecondary }]}>
                    {`Q. ${safeIndex + 1} of ${total}`}
                  </Text>

                  <View style={{ position: 'relative' }}>
                    {isInteractiveTutorialActive && tutorialStep === 'navigate_next' && (
                      <View style={styles.navBtnPointerWrapper} pointerEvents="none">
                        <PracticePointerArrow
                          direction="down"
                          label="TAP NEXT"
                        />
                      </View>
                    )}
                    <Pressable
                      onPress={() => setCurrentIndex(Math.min(total - 1, safeIndex + 1))}
                      disabled={safeIndex >= total - 1}
                      accessibilityRole="button"
                      accessibilityLabel="Next question"
                      style={[
                        styles.oneByOneNavBtn,
                        {
                          backgroundColor: theme.surfaceAlt,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                        Next
                      </Text>
                      <ChevronRight size={18} color={theme.accentText} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </Row>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>

      {/* 4. Fixed Bottom Bar */}
      <BottomBar
        answeredCount={answered}
        totalQuestions={total}
        flaggedCount={flaggedCount}
        onOpenQuestions={openNavigator}
        onSubmit={openSubmitConfirmation}
        tutorialPointer={
          isInteractiveTutorialActive && tutorialStep === 'open_navigator'
            ? 'questions'
            : isInteractiveTutorialActive && tutorialStep === 'review_submit'
              ? 'submit'
              : null
        }
        disabled={false}
      />

      {/* Practice Question Navigator Sheet with Question 5 Spotlight */}
      <PracticeQuestionNavigatorSheet
        visible={navigatorOpen}
        onClose={() => setNavigatorOpen(false)}
        questions={questions}
        answers={answers}
        flags={flags}
        currentIndex={safeIndex}
        onJumpToQuestion={handleJumpToQuestion}
        highlightQuestionNumber={tutorialActive && tutorialStep === 'jump_question_5' ? 5 : undefined}
        isTutorialStep={tutorialActive && tutorialStep === 'jump_question_5'}
        onSkipTutorial={skipTutorial}
      />

      {/* Submit Confirmation Dialog */}
      <SubmitConfirmDialog
        visible={submitConfirmOpen}
        answeredCount={answered}
        unansweredCount={unanswered}
        flaggedCount={flaggedCount}
        totalQuestions={total}
        onClose={() => setSubmitConfirmOpen(false)}
        onReview={handleReviewUnanswered}
        onSubmit={handleConfirmSubmit}
      />

      {/* ─── INTERACTIVE ONBOARDING TUTORIAL GATED STEPS ─── */}
      {isInteractiveTutorialActive ? (
        <>
          {/* Step 1: Screen Overview */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'overview'}
            stepNumber={1}
            totalSteps={8}
            title="Screen Overview & Timer"
            description="Welcome to your examination! Notice the Countdown Timer at the top right, and the Subject Category dropdown at the top to filter question categories."
            cardPlacement="center"
            onNext={() => setTutorialStep('mode_toggle')}
            onSkip={skipTutorial}
          />

          {/* Step 2: Scroll or One by One Mode */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'mode_toggle'}
            stepNumber={2}
            totalSteps={8}
            title="Step 2: Scroll or One by One"
            description="Choose your preferred view! Tap 'Scroll' to see all questions in a continuous list, or 'One by one' to focus on a single question at a time with Next/Previous buttons. Try toggling anytime!"
            cardPlacement="bottom"
            onNext={() => setTutorialStep('select_choice')}
            onSkip={skipTutorial}
          />

          {/* Step 3: Select an Answer (Action-gated) */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'select_choice'}
            stepNumber={3}
            totalSteps={8}
            title="Step 3: Select an Answer"
            description="Tap an answer choice (A, B, C, or D) to select your answer. The selection will highlight immediately with a green checkmark."
            actionRequired={true}
            actionHint="Tap any choice (A, B, C, or D) on Question 1 to continue"
            cardPlacement="top"
            onSkip={skipTutorial}
          />

          {/* Step 4: Mark as Not Sure (Action-gated) */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'flag_question'}
            stepNumber={4}
            totalSteps={8}
            title="Step 4: Mark as Not Sure"
            description="Unsure about an answer? Tap 'Mark as not sure' below the choices. This flags the question with an orange badge so you can easily review it later!"
            actionRequired={!hasFlaggedQ1}
            actionHint="Tap 'Mark as not sure' below the question choices"
            cardPlacement="top"
            onNext={() => setTutorialStep('navigate_next')}
            onSkip={skipTutorial}
          />

          {/* Step 5: Navigate to Next Questions (Action-gated: visit 3 questions) */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'navigate_next'}
            stepNumber={5}
            totalSteps={8}
            title="Step 5: Go to Next Question"
            description={`Tap 'Next' to move forward through Questions 2 and 3. Answer each question as you go! (${visitedQuestions.size}/3 questions visited).`}
            actionRequired={visitedQuestions.size < 3}
            actionHint="Tap 'Next' to visit at least 3 questions and select an answer for each"
            cardPlacement="top"
            onNext={() => setTutorialStep('return_marked')}
            onSkip={skipTutorial}
          />

          {/* Step 6: Return to Marked Question (Action-gated) */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'return_marked'}
            stepNumber={6}
            totalSteps={8}
            title="Step 6: Return to Marked Question"
            description="Great! You visited 3 questions and Question 1 is marked. Now return to Question 1 using 'Previous' to review your flagged answer."
            actionRequired={safeIndex !== 0}
            actionHint="Navigate back to Question 1 (tap 'Previous')"
            cardPlacement="top"
            onNext={() => setTutorialStep('open_navigator')}
            onSkip={skipTutorial}
          />

          {/* Step 7: Open Questions Navigator */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'open_navigator' && !navigatorOpen}
            stepNumber={7}
            totalSteps={8}
            title="Step 7: Click 'Questions' Navigator"
            description="Tap the 'Questions' button in the bottom bar to open the Jump to Question grid and view the status of all 25 questions."
            actionRequired={true}
            actionHint="Tap 'Questions' in the bottom bar to open the sheet"
            cardPlacement="top"
            onNext={openNavigator}
            onSkip={skipTutorial}
          />

          {/* Step 8: Final Review & Submission */}
          <PracticeTutorialOverlay
            visible={tutorialStep === 'review_submit'}
            stepNumber={8}
            totalSteps={8}
            title="Step 8: Final Submission Confirmation"
            description="When finished, tap 'Submit exam'. You will see your answer statistics and type 'EXAM SUBMIT' to finalize your examination."
            cardPlacement="top"
            onNext={skipTutorial}
            onSkip={skipTutorial}
          />
        </>
      ) : null}
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
