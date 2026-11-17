import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AlertCircle, Mail, Sparkles } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeTutorialOverlay } from '@/features/practice/components/PracticeTutorialOverlay';
import { PracticePointerArrow } from '@/features/practice/components/PracticePointerArrow';
import { DEMO_PASSKEY, usePracticeStore } from '@/features/practice/practiceStore';
import { formatPasskey } from '@/features/examinations/services/passkeyFormat';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function PracticePasskeyScreen() {
  const router = useRouter();
  const theme = useExamineeRedesignTheme();
  const storedPasskey = usePracticeStore((s) => s.passkey);
  const setPasskey = usePracticeStore((s) => s.setPasskey);

  const [inputVal, setInputVal] = useState(storedPasskey || DEMO_PASSKEY);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);

  const handleNext = () => {
    const raw = (inputVal || '').trim();
    if (!raw) {
      setError('Please enter a passkey to continue (e.g. DEMO-1234).');
      return;
    }
    setError(null);
    setPasskey(raw);
    router.push('/practice/confirmation' as any);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamineeRedesignChrome
        step={1}
        title="Examination Key"
        stepLabel="Step 2 of 6 · Key"
        onBack={() => router.replace('/practice/scan' as any)}
        footer={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.replace('/practice/scan' as any)}
              style={[styles.secondaryButton, { backgroundColor: theme.secondaryCard }]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Back</Text>
            </Pressable>
            <View style={{ flex: 1.8, position: 'relative' }}>
              {showTutorial && inputVal.trim().length > 0 && (
                <View style={styles.nextBtnPointerWrap} pointerEvents="none">
                  <PracticePointerArrow
                    direction="down"
                    label="TAP 'NEXT' TO CONTINUE"
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next"
                onPress={handleNext}
                style={[styles.primaryButton, { backgroundColor: theme.primary, width: '100%' }]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.white }]}>Next</Text>
              </Pressable>
            </View>
          </View>
        }
      >
        <PracticeBadge
          label="PRACTICE MODE · STEP 2"
          sublabel="Simulated passkey validation · Any non-empty input is accepted"
        />

        <Text style={[styles.intro, { color: theme.secondaryText }]}>
          Type the unique key sent to your Gmail.
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: error ? theme.error : theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="DEMO-1234"
          placeholderTextColor={theme.secondaryText}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          value={inputVal}
          onChangeText={(text) => {
            setInputVal(formatPasskey(text));
            if (error) setError(null);
          }}
          maxLength={9}
          onSubmitEditing={handleNext}
        />
        {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

        {/* Demo Passkey Helper Chip with pointing arrow */}
        <View style={{ position: 'relative', marginTop: 4 }}>
          {showTutorial && (
            <View style={styles.demoChipPointerWrap} pointerEvents="none">
              <PracticePointerArrow
                direction="down"
                label="TAP DEMO KEY TO AUTO-FILL"
              />
            </View>
          )}
          <Pressable
            onPress={() => setInputVal(DEMO_PASSKEY)}
            style={[styles.demoPasskeyChip, { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder }]}
          >
            <Sparkles size={16} color={theme.gold} />
            <Text style={[styles.demoPasskeyText, { color: theme.text }]}>
              Practice Demo Key: <Text style={{ fontFamily: 'Poppins_700Bold' }}>{DEMO_PASSKEY}</Text> (Tap to fill)
            </Text>
          </Pressable>
        </View>

        <View style={[styles.helpCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.helpRow}>
            <View style={[styles.helpIcon, { backgroundColor: theme.primarySoft }]}>
              <Mail size={22} color={theme.primary} />
            </View>
            <View style={styles.helpCopy}>
              <Text style={[styles.helpTitle, { color: theme.text }]}>Where is my key?</Text>
              <Text style={[styles.helpBody, { color: theme.secondaryText }]}>
                In the actual exam, open the permit email from TCC in your Gmail inbox.
              </Text>
            </View>
          </View>
          <View style={styles.helpRow}>
            <View style={[styles.helpIcon, { backgroundColor: theme.primarySoft }]}>
              <AlertCircle size={22} color={theme.primary} />
            </View>
            <View style={styles.helpCopy}>
              <Text style={[styles.helpTitle, { color: theme.text }]}>One key per student</Text>
              <Text style={[styles.helpBody, { color: theme.secondaryText }]}>
                Never share your examination key with anyone else.
              </Text>
            </View>
          </View>
        </View>
      </ExamineeRedesignChrome>

      {/* Tutorial Guidance */}
      <PracticeTutorialOverlay
        visible={showTutorial}
        stepNumber={2}
        totalSteps={8}
        title="Entering Your Examination Key"
        description="Every applicant receives a unique 8-character Examination Key in their registered Gmail account. For this practice session, DEMO-1234 or any input is accepted!"
        cardPlacement="top"
        onNext={() => setShowTutorial(false)}
        onSkip={() => setShowTutorial(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  input: {
    height: 68,
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    paddingHorizontal: 16,
    fontSize: 26,
    fontFamily: 'Poppins_600SemiBold',
    width: '100%',
    letterSpacing: 5,
    textAlign: 'center',
  },
  demoPasskeyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: -2,
  },
  demoPasskeyText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  error: {
    fontSize: 13,
    marginTop: -4,
    fontFamily: 'Poppins_500Medium',
  },
  helpCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 16,
    marginTop: 4,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  helpIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  helpTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  helpBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
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
  nextBtnPointerWrap: {
    position: 'absolute',
    top: -46,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  demoChipPointerWrap: {
    alignItems: 'flex-start',
    marginBottom: 6,
    zIndex: 99999,
  },
});
