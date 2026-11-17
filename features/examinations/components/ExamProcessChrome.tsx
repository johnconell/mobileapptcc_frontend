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
  EXAM_PROCESS_STEPS,
  useExamProcess,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { ExamProcessStepper } from '@/features/examinations/components/ExamProcessStepper';

type ExamProcessChromeProps = {
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

export function ExamProcessChrome({
  step,
  title,
  stepLabel,
  children,
  footer,
  scroll = true,
  contentStyle,
  onBack,
  backLabel = 'Back',
}: ExamProcessChromeProps) {
  const insets = useSafeAreaInsets();
  const tokens = useExamProcess();
  const label =
    stepLabel ??
    `Step ${step + 1} of ${EXAM_PROCESS_STEPS.length} · ${EXAM_PROCESS_STEPS[step]}`;

  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.cardBg,
          borderColor: tokens.cardBorder,
        },
        contentStyle,
      ]}
    >
      <ExamProcessStepper step={step} />
      <Text style={[styles.stepLabel, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
      {children}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor: tokens.pageBg,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} style={styles.topBack} accessibilityRole="button">
          <Text style={[styles.topBackText, { color: tokens.accent }]}>{backLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.topSpacer} />
      )}
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

type ExamProcessActionsProps = {
  children: React.ReactNode;
};

export function ExamProcessActions({ children }: ExamProcessActionsProps) {
  return <View style={styles.actions}>{children}</View>;
}

type ExamProcessButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'next' | 'back' | 'submit' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  flex?: boolean;
};

export function ExamProcessButton({
  title,
  onPress,
  variant = 'next',
  disabled,
  loading,
  flex = true,
}: ExamProcessButtonProps) {
  const tokens = useExamProcess();
  const { isDark } = useThemeTokens();
  const isPrimary = variant === 'next' || variant === 'submit';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        isPrimary && { backgroundColor: tokens.accent },
        variant === 'back' && {
          backgroundColor: tokens.cardElevated,
          borderWidth: 1,
          borderColor: tokens.cardBorder,
        },
        isDanger && {
          backgroundColor: tokens.dangerSoft,
          borderWidth: 1,
          borderColor: tokens.danger,
        },
        flex && styles.btnFlex,
        (disabled || loading) && styles.btnDisabled,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          isPrimary && { color: isDark ? tokens.cardBg : '#FFFFFF' },
          variant === 'back' && { color: tokens.ink },
          isDanger && { color: tokens.error },
        ]}
      >
        {loading ? 'Please wait…' : title}
      </Text>
    </Pressable>
  );
}

export function ExamProcessOk({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const tokens = useExamProcess();
  const { isDark } = useThemeTokens();
  if (!visible) return null;
  return (
    <View
      style={[
        styles.ok,
        {
          backgroundColor: tokens.okBg,
          borderColor: isDark ? 'rgba(127, 216, 164, 0.3)' : '#C5E0CF',
        },
      ]}
    >
      <Text style={[styles.okText, { color: tokens.okText }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topBack: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  topBackText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  topSpacer: { height: 8 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 24,
  },
  fill: { flex: 1, alignItems: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  stepLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnFlex: { flex: 1 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  ok: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  okText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
});
