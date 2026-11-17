import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  StatusBar,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, HelpCircle, QrCode, KeyRound, Sparkles } from 'lucide-react-native';
import { TUTORIAL_STEPS } from '../tutorialData';
import { TutorialHeader } from './TutorialHeader';
import { TutorialControls } from './TutorialControls';
import { DeviceMockup } from './DeviceMockup';

interface ApplicantExamTutorialProps {
  onDismiss?: () => void;
  onComplete?: () => void;
}

export const ApplicantExamTutorial: React.FC<ApplicantExamTutorialProps> = ({
  onDismiss,
  onComplete,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentStepId, setCurrentStepId] = useState<number>(1);
  const [joinTab, setJoinTab] = useState<'qr' | 'code'>('qr');

  const isWideScreen = windowWidth >= 768;
  const currentStep = TUTORIAL_STEPS.find((s) => s.id === currentStepId) ?? TUTORIAL_STEPS[0];
  const totalSteps = TUTORIAL_STEPS.length;

  const handleNext = useCallback(() => {
    if (currentStepId < totalSteps) {
      setCurrentStepId((prev) => prev + 1);
    } else {
      handleFinish();
    }
  }, [currentStepId, totalSteps]);

  const handlePrev = useCallback(() => {
    if (currentStepId > 1) {
      setCurrentStepId((prev) => prev - 1);
    }
  }, [currentStepId]);

  const handleJumpToStep = useCallback((stepNumber: number) => {
    if (stepNumber >= 1 && stepNumber <= totalSteps) {
      setCurrentStepId(stepNumber);
    }
  }, [totalSteps]);

  const handleFinish = useCallback(() => {
    if (onComplete) {
      onComplete();
    } else {
      router.replace('/(student)/scan');
    }
  }, [onComplete, router]);

  const handleExit = useCallback(() => {
    if (onDismiss) {
      onDismiss();
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }
  }, [onDismiss, router]);

  // Responsive device frame sizing
  const mockupWidth = isWideScreen ? 340 : Math.min(windowWidth * 0.86, 320);
  const mockupHeight = Math.round(mockupWidth * 1.95);

  // Render the authentic application image demonstration
  const renderScreenDemonstration = () => {
    // Step 3 (Join Examination): Supports Option A (QR) and Option B (Manual Room Code)
    if (currentStepId === 3) {
      const activeImage = joinTab === 'qr' ? currentStep.image : currentStep.imageSecondary;
      return (
        <View style={styles.imageScreenWrap}>
          {/* Mobile Join Method Selector Pill */}
          <View style={styles.joinMethodToggleRow}>
            <Pressable
              style={[styles.joinToggleBtn, joinTab === 'qr' && styles.joinToggleBtnActive]}
              onPress={() => setJoinTab('qr')}
            >
              <QrCode size={11} color={joinTab === 'qr' ? '#7A1F2B' : '#71717A'} />
              <Text
                style={[
                  styles.joinToggleBtnText,
                  joinTab === 'qr' && styles.joinToggleBtnTextActive,
                ]}
              >
                Scan QR
              </Text>
            </Pressable>
            <Pressable
              style={[styles.joinToggleBtn, joinTab === 'code' && styles.joinToggleBtnActive]}
              onPress={() => setJoinTab('code')}
            >
              <KeyRound size={11} color={joinTab === 'code' ? '#7A1F2B' : '#71717A'} />
              <Text
                style={[
                  styles.joinToggleBtnText,
                  joinTab === 'code' && styles.joinToggleBtnTextActive,
                ]}
              >
                Enter Code
              </Text>
            </Pressable>
          </View>

          {/* Genuine Screenshot from tutorial-assets */}
          <Image
            source={activeImage}
            style={styles.screenshotImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        </View>
      );
    }

    // All other steps: render authentic, genuine screenshot from tutorial-assets
    return (
      <View style={styles.imageScreenWrap}>
        <Image
          source={currentStep.image}
          style={styles.screenshotImage}
          resizeMode="cover"
          fadeDuration={0}
        />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Radiant Background Aura Orbs */}
      <View style={styles.ambientAuraTop} pointerEvents="none" />
      <View style={styles.ambientAuraBottom} pointerEvents="none" />

      {/* Top Navigation Bar with Exit Button */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.brandRow}>
          <HelpCircle size={18} color="#FFFFFF" />
          <View style={styles.appTitleBadge}>
            <Text style={styles.appTitleText}>TCC Entrance Examination Tutorial</Text>
            <View style={styles.appTitleDot} />
          </View>
        </View>

        <Pressable
          style={styles.exitBtn}
          onPress={handleExit}
          accessibilityRole="button"
          accessibilityLabel="Exit tutorial"
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Content Area */}
      {isWideScreen ? (
        /* Wide Screen 2-Column Layout (Desktop / Tablet) */
        <View style={styles.wideContainer}>
          {/* Left Column: Presentation & Chippy Mascot */}
          <ScrollView
            style={styles.wideLeftCol}
            contentContainerStyle={styles.wideLeftContent}
            showsVerticalScrollIndicator={false}
          >
            <TutorialHeader step={currentStep} />
          </ScrollView>

          {/* Right Column: Authentic Phone Mockup(s) */}
          <View style={styles.wideRightCol}>
            {currentStepId === 3 ? (
              <View style={styles.wideDualPhonesRow}>
                <View style={styles.wideDualPhoneItem}>
                  <View style={styles.wideDualPhoneBadge}>
                    <Text style={styles.wideDualPhoneBadgeText}>Phone 1 · Option A (Scan QR)</Text>
                  </View>
                  <DeviceMockup width={240} height={470} hideStatusBar hideHomeIndicator>
                    <Image
                      source={currentStep.image}
                      style={styles.screenshotImage}
                      resizeMode="cover"
                    />
                  </DeviceMockup>
                </View>

                <View style={styles.wideDualPhoneItem}>
                  <View style={styles.wideDualPhoneBadge}>
                    <Text style={styles.wideDualPhoneBadgeText}>Phone 2 · Option B (Enter Code)</Text>
                  </View>
                  <DeviceMockup width={240} height={470} hideStatusBar hideHomeIndicator>
                    <Image
                      source={currentStep.imageSecondary}
                      style={styles.screenshotImage}
                      resizeMode="cover"
                    />
                  </DeviceMockup>
                </View>
              </View>
            ) : (
              <DeviceMockup
                width={mockupWidth}
                height={mockupHeight}
                hideStatusBar
                hideHomeIndicator
              >
                {renderScreenDemonstration()}
              </DeviceMockup>
            )}
          </View>
        </View>
      ) : (
        /* Mobile Portrait Stacked Layout */
        <ScrollView
          style={styles.mobileScroll}
          contentContainerStyle={styles.mobileScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top Text Presentation Header with Chippy the Fox */}
          <View style={styles.mobileHeaderWrap}>
            <TutorialHeader step={currentStep} />
          </View>

          {/* Screen Caption Banner */}
          <View style={styles.screenCaptionWrap}>
            <View style={styles.screenCaptionBadge}>
              <Sparkles size={11} color="#FACC15" />
              <Text style={styles.screenCaptionText}>
                {currentStep.imageLabel || 'Application Screen Preview'}
              </Text>
            </View>
          </View>

          {/* Center Phone Mockup displaying authentic screenshot */}
          <View style={styles.mobileMockupWrap}>
            <DeviceMockup
              width={mockupWidth}
              height={mockupHeight}
              hideStatusBar
              hideHomeIndicator
            >
              {renderScreenDemonstration()}
            </DeviceMockup>
          </View>
        </ScrollView>
      )}

      {/* Bottom Sticky Controls */}
      <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <TutorialControls
          currentStep={currentStepId}
          totalSteps={totalSteps}
          onPrev={handlePrev}
          onNext={handleNext}
          onJumpToStep={handleJumpToStep}
          onFinish={handleFinish}
          onExit={handleExit}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#881337', // TCC Crimson Burgundy base
    position: 'relative',
    overflow: 'hidden',
  },
  ambientAuraTop: {
    position: 'absolute',
    top: -120,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#EA580C',
    opacity: 0.35,
  },
  ambientAuraBottom: {
    position: 'absolute',
    bottom: -150,
    left: -120,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#BE123C',
    opacity: 0.45,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  appTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appTitleText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.3,
  },
  appTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FACC15',
  },
  exitBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 24,
  },
  wideLeftCol: {
    flex: 1.1,
  },
  wideLeftContent: {
    paddingVertical: 16,
    paddingRight: 16,
  },
  wideRightCol: {
    flex: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideDualPhonesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 16,
  },
  wideDualPhoneItem: {
    alignItems: 'center',
    gap: 8,
  },
  wideDualPhoneBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wideDualPhoneBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FACC15',
    fontFamily: 'Poppins_600SemiBold',
  },
  mobileScroll: {
    flex: 1,
  },
  mobileScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },
  mobileHeaderWrap: {
    paddingTop: 4,
  },
  screenCaptionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  screenCaptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  screenCaptionText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  mobileMockupWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  imageScreenWrap: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    position: 'relative',
    overflow: 'hidden',
  },
  screenshotImage: {
    width: '100%',
    height: '100%',
  },
  joinMethodToggleRow: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    zIndex: 30,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  joinToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 7,
  },
  joinToggleBtnActive: {
    backgroundColor: '#FDE8E8',
    borderWidth: 1,
    borderColor: '#7A1F2B',
  },
  joinToggleBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#71717A',
    fontFamily: 'Poppins_500Medium',
  },
  joinToggleBtnTextActive: {
    color: '#7A1F2B',
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
