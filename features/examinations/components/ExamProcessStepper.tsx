import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check, ChevronDown, ChevronRight } from 'lucide-react-native';
import {
  EXAM_PROCESS_STEPS,
  examProcess,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';

type ExamProcessStepperProps = {
  step: ExamProcessStepIndex;
  /** Optionally hide labels on very tight layouts */
  compact?: boolean;
};

/**
 * Horizontal exam-flow stepper: completed = check, current = down chevron,
 * upcoming = right chevron — matches the soft maroon progress reference.
 */
export function ExamProcessStepper({ step, compact = false }: ExamProcessStepperProps) {
  return (
    <View style={styles.row} accessibilityRole="progressbar">
      {EXAM_PROCESS_STEPS.map((label, index) => {
        const done = index < step;
        const current = index === step;
        const upcoming = index > step;
        const lineDone = index < step;

        return (
          <React.Fragment key={label}>
            {index > 0 ? (
              <View
                style={[
                  styles.line,
                  { backgroundColor: lineDone ? examProcess.progressActive : examProcess.progressTrack },
                ]}
              />
            ) : null}
            <View style={styles.stepWrap}>
              <View
                style={[
                  styles.circle,
                  done && styles.circleDone,
                  current && styles.circleCurrent,
                  upcoming && styles.circleUpcoming,
                ]}
              >
                {done ? (
                  <Check size={14} color={examProcess.white} strokeWidth={2.5} />
                ) : current ? (
                  <ChevronDown size={14} color={examProcess.progressActive} strokeWidth={2.5} />
                ) : (
                  <ChevronRight size={14} color={examProcess.progressInactive} strokeWidth={2.2} />
                )}
              </View>
              {!compact ? (
                <Text
                  style={[
                    styles.label,
                    current && styles.labelCurrent,
                    (done || upcoming) && styles.labelMuted,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              ) : null}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const CIRCLE = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  stepWrap: {
    alignItems: 'center',
    width: CIRCLE + 8,
    zIndex: 1,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  circleDone: {
    backgroundColor: examProcess.progressActive,
    borderColor: examProcess.progressActive,
  },
  circleCurrent: {
    backgroundColor: examProcess.white,
    borderColor: examProcess.progressActive,
  },
  circleUpcoming: {
    backgroundColor: examProcess.white,
    borderColor: examProcess.progressInactive,
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: CIRCLE / 2 - 1,
    marginHorizontal: -2,
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: examProcess.fontRegular,
    textAlign: 'center',
    color: examProcess.muted,
  },
  labelCurrent: {
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.progressActive,
  },
  labelMuted: {
    color: examProcess.progressInactive,
  },
});
