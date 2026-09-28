import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  EXAM_PROCESS_STEPS,
  examProcess,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';

type ExamProcessStepperProps = {
  step: ExamProcessStepIndex;
  /** @deprecated compact has no effect — labels are always shown */
  compact?: boolean;
};

/**
 * Clean horizontal stepper for the 6-step exam flow.
 *
 * Layout: circle + connecting line, labels below each circle.
 *  - Done:     filled maroon circle, white checkmark
 *  - Current:  white circle, maroon border (2px), maroon step number
 *  - Upcoming: white circle, muted border, muted step number
 *
 * Labels sit below each circle and are constrained so they never overflow.
 * Uses `adjustsFontSizeToFit` so they shrink before wrapping.
 */
export function ExamProcessStepper({ step }: ExamProcessStepperProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {EXAM_PROCESS_STEPS.map((label, index) => {
        const done = index < step;
        const current = index === step;

        return (
          <React.Fragment key={label}>
            {/* Connector line between steps */}
            {index > 0 ? (
              <View
                style={[
                  styles.line,
                  { backgroundColor: index <= step ? examProcess.progressActive : examProcess.progressTrack },
                ]}
              />
            ) : null}

            <View style={styles.stepWrap}>
              <View
                style={[
                  styles.circle,
                  done && styles.circleDone,
                  current && styles.circleCurrent,
                  !done && !current && styles.circleUpcoming,
                ]}
              >
                {done ? (
                  <Check size={13} color={examProcess.white} strokeWidth={3} />
                ) : (
                  <Text
                    style={[
                      styles.circleNum,
                      current && styles.circleNumCurrent,
                      !current && styles.circleNumUpcoming,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              <Text
                style={[
                  styles.label,
                  current && styles.labelCurrent,
                  done && styles.labelDone,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const CIRCLE = 26;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 12,
  },
  stepWrap: {
    alignItems: 'center',
    // Fixed width ensures all 6 steps fit evenly. 26 circle + some padding for label.
    width: CIRCLE + 16,
    flexShrink: 0,
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
  circleNum: {
    fontSize: 11,
    fontFamily: examProcess.fontSemiBold,
  },
  circleNumCurrent: {
    color: examProcess.progressActive,
  },
  circleNumUpcoming: {
    color: examProcess.progressInactive,
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: CIRCLE / 2 - 1,
    // Slightly overlap the circles so the line meets the circle edge
    marginHorizontal: -1,
  },
  label: {
    marginTop: 5,
    fontSize: 9,
    fontFamily: examProcess.fontRegular,
    textAlign: 'center',
    color: examProcess.progressInactive,
    width: '100%',
  },
  labelCurrent: {
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.progressActive,
  },
  labelDone: {
    color: examProcess.progressActive,
  },
});
