import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ShieldCheck } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeTutorialOverlay } from '@/features/practice/components/PracticeTutorialOverlay';
import { PracticePointerArrow } from '@/features/practice/components/PracticePointerArrow';
import { usePracticeStore } from '@/features/practice/practiceStore';
import {
  examineeRedesignLayout,
  type ExamineeRedesignTheme,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function PracticeConfirmationScreen() {
  const router = useRouter();
  const theme = useExamineeRedesignTheme();
  const applicant = usePracticeStore((s) => s.applicant);
  const agreed = usePracticeStore((s) => s.agreed);
  const setAgreed = usePracticeStore((s) => s.setAgreed);

  const [showTutorial, setShowTutorial] = useState(true);

  const handleAgreeAndContinue = () => {
    if (!agreed) return;
    router.replace('/practice/lobby' as any);
  };

  const goBack = () => {
    router.replace('/practice/passkey' as any);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamineeRedesignChrome
        step={2}
        title="Is this you?"
        stepLabel="Step 3 of 6 · Confirm"
        onBack={goBack}
        footer={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not me"
              onPress={goBack}
              style={[styles.secondaryButton, { backgroundColor: theme.secondaryCard }]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Not me</Text>
            </Pressable>
            <View style={{ flex: 1, position: 'relative' }}>
              {showTutorial && agreed && (
                <View style={styles.agreeBtnPointerWrap} pointerEvents="none">
                  <PracticePointerArrow
                    direction="down"
                    label="TAP TO CONTINUE"
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agree and continue"
                disabled={!agreed}
                onPress={handleAgreeAndContinue}
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.primary },
                  !agreed && styles.disabledButton,
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.white }]}>
                  Agree &amp; Continue
                </Text>
              </Pressable>
            </View>
          </View>
        }
      >
        <PracticeBadge
          label="PRACTICE MODE · STEP 3"
          sublabel="Fictional applicant confirmation · No device locks engaged"
        />

        <Text style={[styles.intro, { color: theme.secondaryText }]}>
          Confirm your registration details before you continue.
        </Text>

        <View style={[styles.identityCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <IdentityRow label="Name" value={applicant.fullName} theme={theme} />
          <IdentityRow label="Program" value={applicant.programName} theme={theme} />
          <IdentityRow label="Gmail" value={applicant.email} theme={theme} />
          <IdentityRow label="Date" value="Fri, Nov 20, 2026" theme={theme} />
          <IdentityRow label="Time · Room" value={`${applicant.timeSlot} · ${applicant.roomName}`} theme={theme} last />
        </View>

        <Text style={[styles.lockedNote, { color: theme.secondaryText }]}>
          Details are locked from your registration. Wrong info? Tell the proctor.
        </Text>

        {/* Practice Security Simulation Notice */}
        <View
          style={[
            styles.simulationNotice,
            { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder },
          ]}
        >
          <ShieldCheck size={20} color={theme.gold} />
          <Text style={[styles.simulationText, { color: theme.text }]}>
            In the actual examination, your screen will be pinned by Android or Guided Access. In Practice Mode, device locks are completely disabled so you can navigate freely.
          </Text>
        </View>

        {/* Rules Card */}
        <View style={[styles.rulesCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.rulesTitle, { color: theme.text }]}>Exam rules</Text>
          <View style={styles.rulesList}>
            <RuleLine text="Connected to exam Wi-Fi with mobile data and hotspot turned off." theme={theme} />
            <RuleLine text="Your screen will be pinned. Do not switch apps." theme={theme} />
            <RuleLine text="No second phones or smartwatches." theme={theme} />
            <RuleLine text="The timer auto-submits at 00:00." theme={theme} />
            <RuleLine text="Results are sent to your Gmail." theme={theme} />
          </View>

          {showTutorial && !agreed && (
            <View style={styles.checkboxPointerWrap} pointerEvents="none">
              <PracticePointerArrow
                direction="down"
                label="CHECK THIS BOX TO AGREE"
              />
            </View>
          )}

          <Pressable
            style={styles.checkboxRow}
            onPress={() => setAgreed(!agreed)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: agreed ? theme.primary : 'transparent',
                  borderColor: agreed ? theme.primary : theme.cardBorder,
                },
              ]}
            >
              {agreed ? <Check size={16} color={theme.white} strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.checkboxLabel, { color: theme.text }]}>I understand and agree</Text>
          </Pressable>
        </View>
      </ExamineeRedesignChrome>

      {/* Tutorial Guidance */}
      <PracticeTutorialOverlay
        visible={showTutorial}
        stepNumber={3}
        totalSteps={8}
        title="Verify Registration & Accept Rules"
        description="Always confirm your name and scheduled program. Next, read the examination rules and check 'I understand and agree' to activate the Continue button."
        actionRequired={!agreed}
        actionHint="Tap the 'I understand and agree' checkbox to continue"
        cardPlacement="top"
        onNext={() => setShowTutorial(false)}
        onSkip={() => setShowTutorial(false)}
      />
    </KeyboardAvoidingView>
  );
}

function IdentityRow({
  label,
  value,
  last = false,
  theme,
}: {
  label: string;
  value: string;
  last?: boolean;
  theme: ExamineeRedesignTheme;
}) {
  return (
    <View style={[styles.identityRow, !last && { borderBottomColor: theme.cardBorder, borderBottomWidth: 1 }]}>
      <Text style={[styles.identityLabel, { color: theme.secondaryText }]}>{label}</Text>
      <Text style={[styles.identityValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function RuleLine({ text, theme }: { text: string; theme: ExamineeRedesignTheme }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleBullet, { color: theme.secondaryText }]}>•</Text>
      <Text style={[styles.ruleText, { color: theme.secondaryText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  identityCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    paddingHorizontal: examineeRedesignLayout.cardPadding,
  },
  identityRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  identityLabel: {
    width: 86,
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  identityValue: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  lockedNote: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    paddingHorizontal: 6,
  },
  simulationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  simulationText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Poppins_500Medium',
  },
  rulesCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 14,
  },
  rulesTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Poppins_600SemiBold',
  },
  rulesList: {
    gap: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ruleBullet: {
    width: 14,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_600SemiBold',
  },
  ruleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  checkboxRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: examineeRedesignLayout.gap,
  },
  secondaryButton: {
    flex: 0.9,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1.8,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  checkboxPointerWrap: {
    alignItems: 'flex-start',
    marginBottom: 8,
    marginTop: 6,
  },
  agreeBtnPointerWrap: {
    position: 'absolute',
    top: -46,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
});
