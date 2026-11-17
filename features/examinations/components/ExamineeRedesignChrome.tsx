import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';
import { type ExamProcessStepIndex } from '@/shared/theme/examProcess';
import { ExamineeRedesignProgress } from './ExamineeRedesignProgress';

type ExamineeRedesignChromeProps = {
  step: ExamProcessStepIndex;
  title: string;
  stepLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onBack?: () => void;
  backLabel?: string;
};

export function ExamineeRedesignChrome({
  step,
  title,
  stepLabel,
  children,
  footer,
  scroll = true,
  contentStyle,
  onBack,
  backLabel = 'Back',
}: ExamineeRedesignChromeProps) {
  const insets = useSafeAreaInsets();
  const theme = useExamineeRedesignTheme();
  const body = (
    <View style={[styles.content, contentStyle]}>
      <ExamineeRedesignProgress step={step} label={stepLabel?.split(' · ')[1]} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor: theme.background,
          paddingTop: Math.max(insets.top, examineeRedesignLayout.verticalPadding),
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.topBar}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <Text style={[styles.topBarText, { color: theme.primary }]}>{backLabel}</Text>
        </Pressable>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
          {footer}
        </ScrollView>
      ) : (
        <View style={styles.fill}>
          {body}
          {footer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: examineeRedesignLayout.screenPadding,
  },
  topBar: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  topBarText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: examineeRedesignLayout.verticalPadding,
  },
  fill: {
    flex: 1,
  },
  content: {
    gap: examineeRedesignLayout.gap,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Poppins_700Bold',
    marginTop: 4,
  },
});
