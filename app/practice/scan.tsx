import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowRight, Check, SkipForward, Wifi, X } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeTutorialOverlay } from '@/features/practice/components/PracticeTutorialOverlay';
import { PracticePointerArrow } from '@/features/practice/components/PracticePointerArrow';
import { usePracticeStore } from '@/features/practice/practiceStore';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function PracticeJoinScreen() {
  const router = useRouter();
  const theme = useExamineeRedesignTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('K7M2P9QX');
  const [showTutorial, setShowTutorial] = useState(true);
  const [scanTutorialStep, setScanTutorialStep] = useState<1 | 2>(1);

  const cameraReady = Boolean(permission?.granted);

  const handleContinue = (inputCode?: string) => {
    const finalCode = (inputCode || code || 'K7M2P9QX').trim().toUpperCase();
    usePracticeStore.setState({ sessionCode: finalCode });
    router.replace('/practice/passkey' as any);
  };

  const handleSkip = () => {
    handleContinue('DEMO-ROOM');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamineeRedesignChrome
        step={0}
        title="Join the Examination"
        stepLabel="Step 1 of 6 · Join"
        onBack={() => router.replace('/')}
        backLabel="Exit Practice"
        footer={
          <View style={styles.footerButtons}>
            <View style={{ flex: 1, position: 'relative' }}>
              {showTutorial && scanTutorialStep === 2 && (
                <View style={styles.skipBtnPointerWrap} pointerEvents="none">
                  <PracticePointerArrow
                    direction="down"
                    label="TAP 'SKIP SCAN' TO CONTINUE"
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip QR scanning"
                onPress={handleSkip}
                style={[styles.skipButton, { backgroundColor: theme.secondaryCard, borderColor: theme.cardBorder, width: '100%' }]}
              >
                <SkipForward size={18} color={theme.text} />
                <Text style={[styles.skipButtonText, { color: theme.text }]}>Skip Scan (Demo)</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              onPress={() => handleContinue()}
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.primaryButtonText, { color: theme.white }]}>Continue</Text>
              <ArrowRight size={18} color={theme.white} />
            </Pressable>
          </View>
        }
      >
        <PracticeBadge
          label="PRACTICE MODE · STEP 1"
          sublabel="Simulated QR scanner & room code entry · Offline"
        />

        {/* Mandatory Pre-Exam Network Setup Checklist */}
        <View style={{ position: 'relative' }}>
          {showTutorial && scanTutorialStep === 1 && (
            <View style={styles.networkPointerWrap} pointerEvents="none">
              <PracticePointerArrow
                direction="down"
                label="CHECK PRE-EXAM NETWORK RULES"
              />
            </View>
          )}
          <View
            style={[styles.networkCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
          <View style={styles.networkHeaderRow}>
            <View style={[styles.networkIconBadge, { backgroundColor: '#DCFCE7' }]}>
              <Wifi size={18} color="#16A34A" strokeWidth={2.5} />
            </View>
            <View style={styles.networkHeaderTextWrap}>
              <Text style={[styles.networkCardTitle, { color: theme.text }]}>
                Pre-Exam Network Checklist
              </Text>
              <Text style={[styles.networkCardSub, { color: theme.secondaryText }]}>
                Mandatory offline room configuration
              </Text>
            </View>
          </View>

          <View style={styles.checklistGroup}>
            {/* 1. Wi-Fi */}
            <View style={[styles.checklistItem, { backgroundColor: theme.secondaryCard }]}>
              <View style={[styles.itemDot, { backgroundColor: '#16A34A' }]}>
                <Check size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>
                  1. Connect to Proctor Wi-Fi
                </Text>
                <Text style={[styles.itemDetail, { color: theme.secondaryText }]}>
                  Must connect to room router (e.g. <Text style={{ fontWeight: '600' }}>TCC_EXAM_ROOM_01</Text>). Offline LAN · No external internet required.
                </Text>
              </View>
            </View>

            {/* 2. Mobile Data OFF */}
            <View style={[styles.checklistItem, { backgroundColor: theme.secondaryCard }]}>
              <View style={[styles.itemDot, { backgroundColor: '#EF4444' }]}>
                <X size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>
                  2. Turn OFF Mobile Data
                </Text>
                <Text style={[styles.itemDetail, { color: theme.secondaryText }]}>
                  Cellular data must be disabled so your phone stays on the exam network.
                </Text>
              </View>
            </View>

            {/* 3. Hotspot OFF */}
            <View style={[styles.checklistItem, { backgroundColor: theme.secondaryCard }]}>
              <View style={[styles.itemDot, { backgroundColor: '#EF4444' }]}>
                <X size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>
                  3. Turn OFF Personal Hotspot
                </Text>
                <Text style={[styles.itemDetail, { color: theme.secondaryText }]}>
                  Tethering and hotspot sharing must remain disabled during the exam.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

        <Text style={[styles.intro, { color: theme.secondaryText }]}>
          Scan the proctor&apos;s QR code, or type the room code below.
        </Text>

        {/* Camera Viewfinder */}
        <View style={[styles.cameraBox, { backgroundColor: theme.cameraBackground }]}>
          <View style={[styles.cameraFrame, { backgroundColor: theme.cameraBackground }]}>
            {cameraReady ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (data) handleContinue(data);
                }}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.cameraFallback, { backgroundColor: theme.cameraBackground }]}>
                <Text style={[styles.cameraFallbackTitle, { color: theme.white }]}>
                  Camera scanner ready
                </Text>
                <Text style={[styles.cameraFallbackText, { color: theme.white }]}>
                  In Practice Mode, you can scan any QR code or tap &quot;Skip Scan&quot; below.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => requestPermission()}
                  style={[styles.cameraButton, { backgroundColor: theme.gold }]}
                >
                  <Text style={[styles.cameraButtonText, { color: theme.text }]}>Enable Camera</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.viewfinderRing} pointerEvents="none" />
          </View>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <Text style={[styles.dividerText, { color: theme.secondaryText }]}>or enter room code</Text>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
        </View>

        <Text style={[styles.fieldLabel, { color: theme.text }]}>Room code</Text>
        <TextInput
          style={[
            styles.codeInput,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              color: theme.text,
            },
          ]}
          placeholder="K7M2P9QX"
          placeholderTextColor={theme.secondaryText}
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          onSubmitEditing={() => handleContinue()}
        />
      </ExamineeRedesignChrome>

      {/* Contextual Onboarding Tutorial Overlays */}
      {showTutorial ? (
        <>
          {/* Step 1: Wi-Fi, Mobile Data & Hotspot Mandatory Setup */}
          <PracticeTutorialOverlay
            visible={scanTutorialStep === 1}
            stepNumber={1}
            totalSteps={2}
            title="Step 1: Exam Wi-Fi · Disable Mobile Data & Hotspot"
            description="Before joining, every examinee must: 1. Connect to the proctor's room Wi-Fi (e.g. TCC_EXAM_ROOM_01; no internet required). 2. Turn OFF Mobile Data. 3. Turn OFF Personal Hotspot so your connection stays stable on the local room network."
            cardPlacement="bottom"
            actionRequired={false}
            actionHint="Connect to Room Wi-Fi and keep Mobile Data & Hotspot turned OFF"
            onNext={() => setScanTutorialStep(2)}
            onSkip={() => setShowTutorial(false)}
          />

          {/* Step 2: Joining via QR Code or Room Code */}
          <PracticeTutorialOverlay
            visible={scanTutorialStep === 2}
            stepNumber={2}
            totalSteps={2}
            title="Step 2: Join via QR Code or Room Code"
            description="During the actual exam, point your camera at the proctor's QR code or type the 8-character Room Code. In Practice Mode, tap 'Skip Scan' to test the full flow instantly."
            cardPlacement="top"
            onNext={() => setShowTutorial(false)}
            onSkip={() => setShowTutorial(false)}
          />
        </>
      ) : null}
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
  cameraBox: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cameraFrame: {
    flex: 1,
    overflow: 'hidden',
  },
  cameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  cameraFallbackTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  cameraFallbackText: {
    maxWidth: 280,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  cameraButton: {
    marginTop: 6,
    minHeight: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  viewfinderRing: {
    ...StyleSheet.absoluteFillObject,
    margin: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  codeInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 3,
    textAlign: 'center',
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: examineeRedesignLayout.gap,
  },
  skipButton: {
    flex: 1,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  primaryButton: {
    flex: 1.2,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  networkCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  networkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  networkIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkHeaderTextWrap: {
    flex: 1,
  },
  networkCardTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  networkCardSub: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  checklistGroup: {
    gap: 8,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    gap: 10,
  },
  itemDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  itemDetail: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Poppins_400Regular',
  },
  skipBtnPointerWrap: {
    position: 'absolute',
    top: -46,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  networkPointerWrap: {
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 99999,
  },
});
