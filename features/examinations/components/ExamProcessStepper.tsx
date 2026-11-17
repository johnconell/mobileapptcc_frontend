import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  EXAM_PROCESS_STEPS,
  useExamProcess,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';

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
  const tokens = useExamProcess();
  const { isDark } = useThemeTokens();

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
                  {
                    backgroundColor: lineDone ? tokens.progressActive : tokens.progressTrack,
                  },
                ]}
              />
            ) : null}
            <View style={styles.stepWrap}>
              <View
                style={[
                  styles.circle,
                  done && {
                    backgroundColor: tokens.progressActive,
                    borderColor: tokens.progressActive,
                  },
                  current && {
                    backgroundColor: tokens.accentSoft,
                    borderColor: tokens.progressActive,
                  },
                  upcoming && {
                    backgroundColor: tokens.cardElevated,
                    borderColor: tokens.progressTrack,
                  },
                ]}
              >
                {done ? (
                  <Check size={14} color={isDark ? tokens.cardBg : '#FFFFFF'} strokeWidth={2.5} />
                ) : (
                  <Text
                    style={[
                      styles.number,
                      {
                        color: current ? tokens.progressActive : tokens.progressInactive,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              {!compact ? (
                <Text
                  style={[
                    styles.label,
                    {
                      color: current
                        ? tokens.progressActive
                        : tokens.progressInactive,
                      fontFamily: current ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                    },
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
  line: {
    flex: 1,
    height: 2,
    marginTop: CIRCLE / 2 - 1,
    marginHorizontal: 3,
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    textAlign: 'center',
    width: '100%',
  },
  number: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
});
