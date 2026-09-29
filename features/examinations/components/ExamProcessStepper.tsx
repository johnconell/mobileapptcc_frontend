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
  /** Optionally hide labels on very tight layouts */
  compact?: boolean;
};

/**
 * Horizontal six-step exam flow: completed = check, current = highlighted,
 * upcoming = muted.
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
                  style={[styles.line, { backgroundColor: lineDone ? examProcess.progressActive : examProcess.progressTrack }]}
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
                {done ? <Check size={14} color={examProcess.white} strokeWidth={2.5} /> : <Text style={[styles.number, current && styles.numberCurrent, upcoming && styles.numberUpcoming]}>{index + 1}</Text>}
              </View>
              {!compact ? (
                <Text
                  style={[
                    styles.label,
                    current && styles.labelCurrent,
                    (done || upcoming) && styles.labelMuted,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
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
    width: '100%',
    marginBottom: 10,
  },
  stepWrap: {
    flex: 1,
    alignItems: 'center',
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
    backgroundColor: examProcess.accentSoft,
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
    marginHorizontal: 3,
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: examProcess.fontRegular,
    textAlign: 'center',
    width: '100%',
    color: examProcess.muted,
  },
  labelCurrent: {
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.progressActive,
  },
  labelMuted: {
    color: examProcess.progressInactive,
  },
  number: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.progressInactive,
  },
  numberCurrent: { color: examProcess.progressActive },
  numberUpcoming: { color: examProcess.progressInactive },
});
