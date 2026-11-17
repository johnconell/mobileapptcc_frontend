import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  EXAM_PROCESS_STEPS,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

type ExamineeRedesignProgressProps = {
  step: ExamProcessStepIndex;
  label?: string;
};

export function ExamineeRedesignProgress({
  step,
  label,
}: ExamineeRedesignProgressProps) {
  const theme = useExamineeRedesignTheme();
  const stepName = label ?? EXAM_PROCESS_STEPS[step];

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of 6`}>
      <View style={styles.segmentRow}>
        {EXAM_PROCESS_STEPS.map((stepLabel, index) => (
          <View
            key={stepLabel}
            style={[
              styles.segment,
              { backgroundColor: index <= step ? theme.primary : theme.cardBorder },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: theme.secondaryText }]}>
        {`Step ${step + 1} of 6 · ${stepName}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: '100%',
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  label: {
    marginTop: examineeRedesignLayout.gap,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
});
