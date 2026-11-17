import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView } from 'react-native';
import { QrCode, Keyboard, ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step3JoinScreenProps {
  onContinue?: () => void;
  initialMode?: 'dual' | 'scan' | 'code';
}

/**
 * Option A: Authentic Camera Viewfinder Screen for QR Scanning
 */
export const Step3_ScanView: React.FC<{ onContinue?: () => void; compact?: boolean }> = ({
  onContinue,
  compact = false,
}) => {
  return (
    <View style={[styles.subContainer, compact && styles.compactContainer]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <ArrowLeft size={compact ? 12 : 16} color="#7A1F2B" />
        <View>
          <Text style={[styles.stepperText, compact && { fontSize: 8 }]}>Step 1 of 6 · Join</Text>
          <Text style={[styles.screenTitle, compact && { fontSize: 11 }]}>Scan QR Code</Text>
        </View>
      </View>

      <Text style={[styles.instruction, compact && { fontSize: 8.5, lineHeight: 11 }]}>
        Align the camera with the proctor QR code shown on the room screen.
      </Text>

      {/* Viewfinder Card */}
      <View style={[styles.viewfinderCard, compact && { padding: 6, marginVertical: 2 }]}>
        <View style={[styles.viewfinderFrame, compact && { width: 110, height: 110 }]}>
          {/* Viewfinder Corners */}
          <View style={[styles.corner, styles.cornerTL, compact && { width: 10, height: 10 }]} />
          <View style={[styles.corner, styles.cornerTR, compact && { width: 10, height: 10 }]} />
          <View style={[styles.corner, styles.cornerBL, compact && { width: 10, height: 10 }]} />
          <View style={[styles.corner, styles.cornerBR, compact && { width: 10, height: 10 }]} />

          {/* Simulated Proctor QR Target */}
          <View style={styles.qrPlaceholder}>
            <QrCode size={compact ? 48 : 78} color="#E2E8F0" />
            <View style={[styles.scanLine, compact && { width: 70 }]} />
          </View>

          <Text style={[styles.viewfinderHint, compact && { fontSize: 7, bottom: 4 }]}>
            Align QR within frame
          </Text>
        </View>
        {!compact && <TouchPointer x={145} y={100} />}
      </View>

      <Pressable
        style={[styles.actionBtn, compact && { paddingVertical: 6, marginTop: 4 }]}
        onPress={onContinue}
      >
        <Text style={[styles.actionBtnText, compact && { fontSize: 9.5 }]}>
          Simulate Proctor QR Scanned
        </Text>
      </Pressable>
    </View>
  );
};

/**
 * Option B: Authentic Manual Room Code Input Screen
 */
export const Step3_CodeView: React.FC<{ onContinue?: () => void; compact?: boolean }> = ({
  onContinue,
  compact = false,
}) => {
  const [examCode, setExamCode] = useState('K7M2P9QX');

  return (
    <View style={[styles.subContainer, compact && styles.compactContainer]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <ArrowLeft size={compact ? 12 : 16} color="#7A1F2B" />
        <View>
          <Text style={[styles.stepperText, compact && { fontSize: 8 }]}>Step 1 of 6 · Join</Text>
          <Text style={[styles.screenTitle, compact && { fontSize: 11 }]}>Enter Code</Text>
        </View>
      </View>

      <Text style={[styles.instruction, compact && { fontSize: 8.5, lineHeight: 11 }]}>
        Type the 8-character room code from your proctor if camera is unavailable.
      </Text>

      {/* Manual Code Input Card */}
      <View style={[styles.codeCard, compact && { padding: 8, marginVertical: 2, gap: 4 }]}>
        <Text style={[styles.fieldLabel, compact && { fontSize: 9 }]}>Examination Code</Text>
        <TextInput
          style={[styles.input, compact && { paddingVertical: 5, fontSize: 11, letterSpacing: 1 }]}
          value={examCode}
          onChangeText={setExamCode}
          placeholder="K7M2P9QX"
          placeholderTextColor="#A89E94"
          autoCapitalize="characters"
        />
        <Text style={[styles.fieldHint, compact && { fontSize: 7 }]}>
          Format: 8-12 alphanumeric characters
        </Text>

        <Pressable
          style={[styles.actionBtn, compact && { paddingVertical: 6, marginTop: 4 }]}
          onPress={onContinue}
        >
          <Text style={[styles.actionBtnText, compact && { fontSize: 9.5 }]}>
            Continue to Verification
          </Text>
        </Pressable>
        {!compact && <TouchPointer x={145} y={115} />}
      </View>
    </View>
  );
};

/**
 * Master Step 3 Screen: Features TWO PHONES display
 * Showing Option A (Scan QR) and Option B (Enter Code) simultaneously!
 */
export const Step3_JoinScreen: React.FC<Step3JoinScreenProps> = ({
  onContinue,
  initialMode = 'dual',
}) => {
  const [viewMode, setViewMode] = useState<'dual' | 'scan' | 'code'>(initialMode);

  return (
    <View style={styles.container}>
      {/* Mode Selection Pills: Dual Phone View vs Deep Dive */}
      <View style={styles.topSelectorRow}>
        <Pressable
          style={[styles.selectorPill, viewMode === 'dual' && styles.selectorPillActive]}
          onPress={() => setViewMode('dual')}
        >
          <Sparkles size={11} color={viewMode === 'dual' ? '#FFFFFF' : '#7A1F2B'} />
          <Text
            style={[styles.selectorPillText, viewMode === 'dual' && styles.selectorPillTextActive]}
          >
            2 Phones (Both Ways)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.selectorPill, viewMode === 'scan' && styles.selectorPillActive]}
          onPress={() => setViewMode('scan')}
        >
          <QrCode size={11} color={viewMode === 'scan' ? '#FFFFFF' : '#7A1F2B'} />
          <Text
            style={[styles.selectorPillText, viewMode === 'scan' && styles.selectorPillTextActive]}
          >
            Phone 1 (QR)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.selectorPill, viewMode === 'code' && styles.selectorPillActive]}
          onPress={() => setViewMode('code')}
        >
          <Keyboard size={11} color={viewMode === 'code' ? '#FFFFFF' : '#7A1F2B'} />
          <Text
            style={[styles.selectorPillText, viewMode === 'code' && styles.selectorPillTextActive]}
          >
            Phone 2 (Code)
          </Text>
        </Pressable>
      </View>

      {/* RENDER DUAL PHONES OR SINGLE FOCUS */}
      {viewMode === 'dual' ? (
        <ScrollView
          style={styles.dualScroll}
          contentContainerStyle={styles.dualContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Banner */}
          <View style={styles.dualBanner}>
            <CheckCircle2 size={13} color="#16A34A" />
            <Text style={styles.dualBannerText}>
              Two ways to join your offline exam room:
            </Text>
          </View>

          {/* TWO PHONES SIDE-BY-SIDE OR STACKED MINI FRAMES */}
          <View style={styles.miniPhonesRow}>
            {/* MINI PHONE 1: OPTION A */}
            <View style={styles.miniPhoneFrame}>
              <View style={styles.miniPhoneHeader}>
                <View style={styles.miniPhoneBadgeA}>
                  <Text style={styles.miniPhoneBadgeText}>PHONE 1 · OPTION A</Text>
                </View>
                <Text style={styles.miniPhoneTitle}>Scan Proctor QR</Text>
              </View>
              <View style={styles.miniPhoneBody}>
                <Step3_ScanView onContinue={onContinue} compact />
              </View>
            </View>

            {/* MINI PHONE 2: OPTION B */}
            <View style={styles.miniPhoneFrame}>
              <View style={styles.miniPhoneHeader}>
                <View style={styles.miniPhoneBadgeB}>
                  <Text style={styles.miniPhoneBadgeText}>PHONE 2 · OPTION B</Text>
                </View>
                <Text style={styles.miniPhoneTitle}>Enter Room Code</Text>
              </View>
              <View style={styles.miniPhoneBody}>
                <Step3_CodeView onContinue={onContinue} compact />
              </View>
            </View>
          </View>

          {/* Footer Note */}
          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>
              💡 Either method connects you to the same local proctor room.
            </Text>
          </View>
        </ScrollView>
      ) : viewMode === 'scan' ? (
        <Step3_ScanView onContinue={onContinue} />
      ) : (
        <Step3_CodeView onContinue={onContinue} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    padding: 10,
    justifyContent: 'space-between',
  },
  subContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 4,
  },
  compactContainer: {
    padding: 2,
    justifyContent: 'flex-start',
    gap: 4,
  },
  topSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#EFE7DB',
    borderRadius: 10,
    padding: 3,
    gap: 4,
    marginBottom: 6,
  },
  selectorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 7,
  },
  selectorPillActive: {
    backgroundColor: '#7A1F2B',
  },
  selectorPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#7A1F2B',
    fontFamily: 'Poppins_500Medium',
  },
  selectorPillTextActive: {
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
  },
  stepperText: {
    fontSize: 9.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  screenTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  instruction: {
    fontSize: 10,
    lineHeight: 14,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
    marginVertical: 2,
  },
  viewfinderCard: {
    position: 'relative',
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    alignItems: 'center',
    marginVertical: 4,
  },
  viewfinderFrame: {
    width: 160,
    height: 160,
    backgroundColor: '#1A1410',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#FF7A00',
  },
  cornerTL: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  scanLine: {
    position: 'absolute',
    width: 100,
    height: 2,
    backgroundColor: '#FF7A00',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 4,
  },
  viewfinderHint: {
    position: 'absolute',
    bottom: 6,
    fontSize: 8,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Poppins_400Regular',
  },
  codeCard: {
    position: 'relative',
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 6,
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  input: {
    backgroundColor: '#FFFDF8',
    borderWidth: 1.5,
    borderColor: '#7A1F2B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  fieldHint: {
    fontSize: 8,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  actionBtn: {
    backgroundColor: '#7A1F2B',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  dualScroll: {
    flex: 1,
  },
  dualContent: {
    gap: 8,
    paddingBottom: 4,
  },
  dualBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dualBannerText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#166534',
    fontFamily: 'Poppins_500Medium',
  },
  miniPhonesRow: {
    gap: 8,
  },
  miniPhoneFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2D9CC',
    padding: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  miniPhoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE6',
    marginBottom: 4,
  },
  miniPhoneBadgeA: {
    backgroundColor: '#7A1F2B',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPhoneBadgeB: {
    backgroundColor: '#EA580C',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPhoneBadgeText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  miniPhoneTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  miniPhoneBody: {
    minHeight: 140,
  },
  footerNote: {
    backgroundColor: '#F5EFE6',
    borderRadius: 8,
    padding: 6,
  },
  footerNoteText: {
    fontSize: 8.5,
    color: '#7A6E62',
    lineHeight: 12,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
});
