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
  examProcess,
  type ExamProcessStepIndex,
} from '@/shared/theme/examProcess';
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
  const label =
    stepLabel ??
    `Step ${step + 1} of ${EXAM_PROCESS_STEPS.length} · ${EXAM_PROCESS_STEPS[step]}`;

  const body = (
    <View style={[styles.card, contentStyle]}>
      <ExamProcessStepper step={step} />
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} style={styles.topBack} accessibilityRole="button">
          <Text style={styles.topBackText}>{backLabel}</Text>
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
  const isPrimary = variant === 'next' || variant === 'submit';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        isPrimary && styles.btnPrimary,
        variant === 'back' && styles.btnBack,
        isDanger && styles.btnDanger,
        flex && styles.btnFlex,
        (disabled || loading) && styles.btnDisabled,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          isPrimary && styles.btnTextPrimary,
          variant === 'back' && styles.btnTextBack,
          isDanger && styles.btnTextDanger,
        ]}
      >
        {loading ? 'Please wait…' : title}
      </Text>
    </Pressable>
  );
}

export function ExamProcessOk({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <View style={styles.ok}>
      <Text style={styles.okText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: examProcess.pageBg,
    paddingHorizontal: examProcess.padPage,
  },
  topBack: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  topBackText: {
    color: examProcess.accent,
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
  },
  topSpacer: { height: 8 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 24,
  },
  fill: { flex: 1, alignItems: 'center' },
  card: {
    backgroundColor: examProcess.cardBg,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    borderRadius: examProcess.radiusCard,
    padding: examProcess.padCard,
    width: '100%',
    maxWidth: 400,
  },
  stepLabel: {
    color: examProcess.muted,
    fontSize: 13,
    fontFamily: examProcess.fontRegular,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btn: {
    borderRadius: examProcess.radiusControl,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnFlex: { flex: 1 },
  btnPrimary: {
    backgroundColor: examProcess.accent,
  },
  btnBack: {
    backgroundColor: examProcess.cardElevated,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
  },
  btnDanger: {
    backgroundColor: examProcess.dangerSoft,
    borderWidth: 1,
    borderColor: examProcess.danger,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, fontFamily: examProcess.fontMedium },
  btnTextPrimary: { color: examProcess.white },
  btnTextBack: { color: examProcess.ink },
  btnTextDanger: { color: examProcess.error },
  ok: {
    backgroundColor: examProcess.okBg,
    borderRadius: examProcess.radiusControl,
    borderWidth: 1,
    borderColor: '#C5E0CF',
    padding: 12,
    marginTop: 12,
  },
  okText: {
    color: examProcess.okText,
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
  },
});
