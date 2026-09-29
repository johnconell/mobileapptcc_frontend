import React, { memo, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { CheckCircle2, AlertCircle, Flag, Send } from 'lucide-react-native';
import { isConfirmPhrase } from '@/features/examinations/services/submitGate';
import { Row } from './primitives';

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
  const [text, setText] = useState('');
  const matches = isConfirmPhrase(text);

  useEffect(() => {
    setText('');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: `${isDark ? theme.bg : theme.text}73` }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss submit confirmation"
        />

        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>
            Submit Examination
          </Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Are you sure you want to submit your exam? Once submitted, your answers will be finalized.
          </Text>

          {/* Counts Breakdown */}
          <View style={styles.countsContainer}>
            {/* Answered */}
            <View
              style={[
                styles.countRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.countLeft}>
                <CheckCircle2 size={18} color={theme.accent} strokeWidth={2} />
                <Text style={[styles.countLabel, { color: theme.text }]}>
                  Answered questions
                </Text>
              </View>
              <Text style={[styles.countValue, { color: theme.accentText, fontWeight: '600' }]}>
                {`${answeredCount}/${totalQuestions}`}
              </Text>
            </View>

            {/* Unanswered */}
            <View
              style={[
                styles.countRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.countLeft}>
                <AlertCircle
                  size={18}
                  color={unansweredCount > 0 ? theme.timer.red.text : theme.textSecondary}
                  strokeWidth={2}
                />
                <Text style={[styles.countLabel, { color: theme.text }]}>
                  Unanswered questions
                </Text>
              </View>
              <Text
                style={[
                  styles.countValue,
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
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.countLeft}>
                <Flag
                  size={18}
                  color={flaggedCount > 0 ? theme.notSure.text : theme.textSecondary}
                  strokeWidth={2}
                  fill={flaggedCount > 0 ? theme.notSure.dot : 'transparent'}
                />
                <Text style={[styles.countLabel, { color: theme.text }]}>
                  Marked as not sure
                </Text>
              </View>
              <Text
                style={[
                  styles.countValue,
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

          <Text style={[styles.phrasePrompt, { color: theme.text }]}>
            To confirm, type <Text style={{ color: theme.accentText, fontWeight: '500' }}>exam submit</Text>
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type here"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => {
              if (matches) onSubmit(text);
            }}
            style={[
              styles.phraseInput,
              {
                borderColor: matches ? theme.timer.green.text : theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
              matches && styles.phraseInputMatched,
            ]}
          />
          {text.length > 0 && !matches ? (
            <Text style={[styles.phraseHint, { color: theme.textMuted }]}>Type exactly: exam submit</Text>
          ) : null}

          {/* Action Buttons: Review on left, Submit on right */}
          <Row style={styles.actionsRow}>
            <Pressable
              onPress={onReview}
              accessibilityRole="button"
              accessibilityLabel="Review questions"
              style={[
                styles.reviewButton,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.reviewText, { color: theme.accentText }]}>
                Review
              </Text>
            </Pressable>

            <Pressable
              disabled={!matches}
              onPress={() => {
                if (matches) onSubmit(text);
              }}
              accessibilityRole="button"
              accessibilityLabel="Confirm exam submission"
              accessibilityState={{ disabled: !matches }}
              style={[
                styles.submitButton,
                {
                  backgroundColor: matches ? theme.accent : theme.surfaceAlt,
                  borderColor: matches ? theme.accent : theme.border,
                },
              ]}
            >
              <Send size={16} color={matches ? theme.onAccent : theme.textMuted} />
              <Text style={[styles.submitText, { color: matches ? theme.onAccent : theme.textMuted }]}>Submit exam</Text>
            </Pressable>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const SubmitConfirmDialog = memo(SubmitConfirmDialogComponent);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  phrasePrompt: {
    fontSize: 13,
    lineHeight: 19,
  },
  phraseInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    marginTop: 6,
  },
  phraseInputMatched: {
    borderWidth: 1.5,
  },
  phraseHint: {
    fontSize: 12,
    marginTop: 4,
  },
  countsContainer: {
    gap: 8,
    marginVertical: 4,
  },
  countRow: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  countValue: {
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  reviewButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: {
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
