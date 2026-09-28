import React, { memo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { CheckCircle2, AlertCircle, Flag } from 'lucide-react-native';

export interface SubmitConfirmDialogProps {
  visible: boolean;
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  totalQuestions: number;
  onReview: () => void;
  onSubmit: () => void;
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
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
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

          {/* Action Buttons: Review on left, Submit on right */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={onReview}
              accessibilityRole="button"
              accessibilityLabel="Review questions"
              style={({ pressed }) => [
                styles.reviewButton,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.reviewText, { color: theme.accentText }]}>
                Review
              </Text>
            </Pressable>

            <Pressable
              onPress={onSubmit}
              accessibilityRole="button"
              accessibilityLabel="Confirm exam submission"
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: theme.accent,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text style={[styles.submitText, { color: theme.onAccent }]}>
                Submit
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const SubmitConfirmDialog = memo(SubmitConfirmDialogComponent);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 0.5,
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
  countsContainer: {
    gap: 8,
    marginVertical: 4,
  },
  countRow: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0.5,
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
    borderWidth: 0.5,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
