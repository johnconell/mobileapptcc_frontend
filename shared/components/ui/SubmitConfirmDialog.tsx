import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { CheckCircle2, AlertCircle, Flag, Send } from 'lucide-react-native';
import { isConfirmPhrase } from '@/features/examinations/services/submitGate';
import { Row } from './primitives';
import { debugEvent } from '@/shared/utils/debugDiagnostics';

export interface SubmitConfirmDialogProps {
  visible: boolean;
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  totalQuestions: number;
  onReview: () => void;
  onSubmit: (typedPhrase: string) => void;
  onClose: () => void;
}

function SubmitConfirmDialogComponent({
  visible,
  answeredCount,
  unansweredCount,
  flaggedCount,
  totalQuestions,
  onReview,
  onSubmit,
  onClose,
}: SubmitConfirmDialogProps) {
  const { theme, isDark } = useThemeTokens();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 720;

  const [text, setText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const renderCount = useRef(0);
  renderCount.current += 1;
  const matches = isConfirmPhrase(text);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_DEBUG_DIAGNOSTICS !== '1') return;
    const timer = setInterval(() => {
      debugEvent('submit.render_rate', { rendersLastSecond: renderCount.current });
      renderCount.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const safeTop = Math.max(insets.top, 16);
  const safeBottom = Math.max(insets.bottom, 16);

  useEffect(() => {
    if (!visible) {
      setText('');
      setKeyboardVisible(false);
      Keyboard.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      debugEvent('submit.keyboard', { state: 'show' });
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      debugEvent('submit.keyboard', { state: 'hide' });
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window, screen }) => {
      debugEvent('submit.dimensions', {
        windowHeight: window.height,
        screenHeight: screen.height,
      });
    });
    return () => subscription.remove();
  }, []);

  const isContentTaller =
    cardHeight > 0 &&
    containerHeight > 0 &&
    cardHeight > containerHeight - (safeTop + safeBottom);

  const shouldAlignTop = keyboardVisible || isContentTaller;

  const handleInputFocus = useCallback(() => {
    debugEvent('submit.input_focus');
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, []);

  useEffect(() => {
    if (!keyboardVisible && !isContentTaller) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [keyboardVisible, isContentTaller]);

  const handleRequestClose = useCallback(() => {
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  }, [keyboardVisible, onClose]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleBackdropPress = useCallback(() => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      handleClose();
    }
  }, [keyboardVisible, handleClose]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, handleRequestClose]);

  if (!visible) return null;

  return (
      <View
        style={[
          styles.overlay,
          { backgroundColor: `${isDark ? theme.bg : theme.text}73` },
        ]}
        pointerEvents="auto"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoiding}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.dialogScroll}
            contentContainerStyle={[
              styles.dialogScrollContent,
              shouldAlignTop ? styles.alignTop : styles.alignCenter,
              {
                paddingTop: safeTop,
                paddingBottom: safeBottom,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            bounces={false}
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
          >
            <Pressable
              style={[
                styles.backdropPressable,
                shouldAlignTop ? styles.alignTop : styles.alignCenter,
              ]}
              onPress={handleBackdropPress}
              accessibilityLabel="Dismiss submit confirmation"
            >
              <View
                onStartShouldSetResponder={() => true}
                onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
                style={[
                  styles.dialogCard,
                  isCompact && styles.dialogCardCompact,
                  {
                    backgroundColor: isDark ? '#222730' : theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.title,
                    isCompact && styles.titleCompact,
                    { color: theme.text },
                  ]}
                >
                  Confirm Examination Submission
                </Text>

                <Text
                  style={[
                    styles.description,
                    isCompact && styles.descriptionCompact,
                    { color: theme.textSecondary },
                  ]}
                >
                  Are you sure you want to submit your exam? Once submitted, your answers will be finalized.
                </Text>

                {/* Counts Breakdown */}
                <View
                  style={[
                    styles.countsContainer,
                    isCompact && styles.countsContainerCompact,
                  ]}
                >
                  {/* Answered */}
                  <View
                    style={[
                      styles.countRow,
                      isCompact && styles.countRowCompact,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.countLeft}>
                      <CheckCircle2
                        size={isCompact ? 16 : 18}
                        color={theme.accent}
                        strokeWidth={2}
                      />
                      <Text
                        style={[
                          styles.countLabel,
                          isCompact && styles.countLabelCompact,
                          { color: theme.text },
                        ]}
                      >
                        Answered questions
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.countValue,
                        isCompact && styles.countValueCompact,
                        { color: theme.accentText, fontWeight: '600' },
                      ]}
                    >
                      {`${answeredCount}/${totalQuestions}`}
                    </Text>
                  </View>

                  {/* Unanswered */}
                  <View
                    style={[
                      styles.countRow,
                      isCompact && styles.countRowCompact,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.countLeft}>
                      <AlertCircle
                        size={isCompact ? 16 : 18}
                        color={unansweredCount > 0 ? theme.timer.red.text : theme.textSecondary}
                        strokeWidth={2}
                      />
                      <Text
                        style={[
                          styles.countLabel,
                          isCompact && styles.countLabelCompact,
                          { color: theme.text },
                        ]}
                      >
                        Unanswered questions
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.countValue,
                        isCompact && styles.countValueCompact,
                        {
                          color: unansweredCount > 0 ? theme.timer.red.text : theme.textSecondary,
                          fontWeight: unansweredCount > 0 ? '600' : '400',
                        },
                      ]}
                    >
                      {unansweredCount}
                    </Text>
                  </View>

                  {/* Marked as Not Sure */}
                  <View
                    style={[
                      styles.countRow,
                      isCompact && styles.countRowCompact,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.countLeft}>
                      <Flag
                        size={isCompact ? 16 : 18}
                        color={flaggedCount > 0 ? theme.notSure.text : theme.textSecondary}
                        strokeWidth={2}
                        fill={flaggedCount > 0 ? theme.notSure.dot : 'transparent'}
                      />
                      <Text
                        style={[
                          styles.countLabel,
                          isCompact && styles.countLabelCompact,
                          { color: theme.text },
                        ]}
                      >
                        Marked as not sure
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.countValue,
                        isCompact && styles.countValueCompact,
                        {
                          color: flaggedCount > 0 ? theme.notSure.text : theme.textSecondary,
                          fontWeight: flaggedCount > 0 ? '600' : '400',
                        },
                      ]}
                    >
                      {flaggedCount}
                    </Text>
                  </View>
                </View>

                {/* Final Confirmation Instructions */}
                <View
                  style={[
                    styles.confirmationInstruction,
                    isCompact && styles.confirmationInstructionCompact,
                    {
                      backgroundColor: isDark ? '#3B2B1F' : '#FFF4D6',
                      borderColor: isDark ? '#D99A4A' : '#C98A24',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.instructionTitle,
                      isCompact && styles.instructionTitleCompact,
                      { color: isDark ? '#FFD99A' : '#6B4300' },
                    ]}
                  >
                    Final confirmation required
                  </Text>
                  <Text
                    style={[
                      styles.instructionText,
                      isCompact && styles.instructionTextCompact,
                      { color: isDark ? '#FFF4D6' : '#3F2A00' },
                    ]}
                  >
                    Type this exact phrase:
                  </Text>
                  <Text
                    style={[
                      styles.phraseValue,
                      isCompact && styles.phraseValueCompact,
                      { color: isDark ? '#FFD99A' : '#7A1F2B' },
                    ]}
                  >
                    EXAM SUBMIT
                  </Text>
                  <Text
                    style={[
                      styles.instructionText,
                      isCompact && styles.instructionTextCompact,
                      { color: isDark ? '#FFF4D6' : '#3F2A00' },
                    ]}
                  >
                    Enter it below to submit your examination.
                  </Text>
                </View>

                {/* Confirmation Input */}
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  onFocus={handleInputFocus}
                  onBlur={() => debugEvent('submit.input_blur')}
                  placeholder="Type EXAM SUBMIT here"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={() => {
                    if (matches) {
                      Keyboard.dismiss();
                      onSubmit(text);
                    }
                  }}
                  style={[
                    styles.phraseInput,
                    isCompact && styles.phraseInputCompact,
                    {
                      borderColor: matches ? theme.timer.green.text : theme.border,
                      backgroundColor: theme.surfaceAlt,
                      color: theme.text,
                    },
                    matches && styles.phraseInputMatched,
                  ]}
                />
                {text.length > 0 && !matches ? (
                  <Text
                    style={[
                      styles.phraseHint,
                      isCompact && styles.phraseHintCompact,
                      { color: theme.timer.red.text },
                    ]}
                  >
                    That does not match yet. Type EXAM SUBMIT exactly.
                  </Text>
                ) : null}

                {/* Action Buttons: Review on left, Submit on right */}
                <Row style={[styles.actionsRow, isCompact && styles.actionsRowCompact]}>
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      onReview();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Review questions"
                    style={[
                      styles.reviewButton,
                      isCompact && styles.reviewButtonCompact,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.reviewText,
                        isCompact && styles.reviewTextCompact,
                        { color: theme.accentText },
                      ]}
                    >
                      Review
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={!matches}
                    onPress={() => {
                      if (matches) {
                        Keyboard.dismiss();
                        onSubmit(text);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm exam submission"
                    accessibilityState={{ disabled: !matches }}
                    style={[
                      styles.submitButton,
                      isCompact && styles.submitButtonCompact,
                      {
                        backgroundColor: matches ? theme.accent : theme.surfaceAlt,
                        borderColor: matches ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Send
                      size={isCompact ? 15 : 16}
                      color={matches ? theme.onAccent : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.submitText,
                        isCompact && styles.submitTextCompact,
                        { color: matches ? theme.onAccent : theme.textMuted },
                      ]}
                    >
                      Submit exam
                    </Text>
                  </Pressable>
                </Row>
              </View>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
  );
}

export const SubmitConfirmDialog = memo(SubmitConfirmDialogComponent);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1_000_001,
    elevation: 1_000_001,
  },
  keyboardAvoiding: {
    flex: 1,
    width: '100%',
  },
  dialogScroll: {
    flex: 1,
    width: '100%',
  },
  dialogScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backdropPressable: {
    width: '100%',
    flexGrow: 1,
    alignItems: 'center',
  },
  alignCenter: {
    justifyContent: 'center',
  },
  alignTop: {
    justifyContent: 'flex-start',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  dialogCardCompact: {
    padding: 13,
    gap: 9,
    borderRadius: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  titleCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  confirmationInstruction: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  confirmationInstructionCompact: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    gap: 2,
    borderRadius: 10,
  },
  instructionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  instructionTitleCompact: {
    fontSize: 11,
  },
  instructionText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  instructionTextCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  phraseValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 26,
  },
  phraseValueCompact: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 1.5,
  },
  phraseInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 15,
    marginTop: 4,
  },
  phraseInputCompact: {
    minHeight: 44,
    paddingHorizontal: 10,
    fontSize: 14,
    marginTop: 2,
    borderRadius: 10,
  },
  phraseInputMatched: {
    borderWidth: 1.5,
  },
  phraseHint: {
    fontSize: 12,
    marginTop: 3,
  },
  phraseHintCompact: {
    fontSize: 11,
    marginTop: 2,
  },
  countsContainer: {
    gap: 8,
    marginVertical: 2,
  },
  countsContainerCompact: {
    gap: 5,
    marginVertical: 0,
  },
  countRow: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countRowCompact: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  countLabel: {
    fontSize: 13,
  },
  countLabelCompact: {
    fontSize: 12,
  },
  countValue: {
    fontSize: 14,
  },
  countValueCompact: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionsRowCompact: {
    gap: 8,
    marginTop: 2,
  },
  reviewButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonCompact: {
    height: 42,
    borderRadius: 10,
  },
  reviewText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reviewTextCompact: {
    fontSize: 13,
  },
  submitButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  submitButtonCompact: {
    height: 42,
    borderRadius: 10,
    gap: 5,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitTextCompact: {
    fontSize: 13,
  },
});
