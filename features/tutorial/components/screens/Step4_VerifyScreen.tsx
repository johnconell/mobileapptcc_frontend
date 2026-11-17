import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CheckSquare, Square, Mail, ShieldCheck, ArrowLeft, Key } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step4VerifyScreenProps {
  onConfirm?: () => void;
}

export const Step4_VerifyScreen: React.FC<Step4VerifyScreenProps> = ({ onConfirm }) => {
  const [agreed, setAgreed] = useState(true);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ArrowLeft size={16} color="#7A1F2B" />
        <View>
          <Text style={styles.stepperText}>Step 2 of 6 · Identity</Text>
          <Text style={styles.screenTitle}>Confirm Your Information</Text>
        </View>
      </View>

      {/* Passkey Verified Pill */}
      <View style={styles.passkeyPill}>
        <Key size={12} color="#16A34A" />
        <Text style={styles.passkeyLabel}>Passkey Verified:</Text>
        <Text style={styles.passkeyValue}>EXAM-2026-TCC</Text>
      </View>

      {/* Applicant Card */}
      <View style={styles.studentCard}>
        <View style={styles.studentHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>JD</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>Juan Dela Cruz</Text>
            <Text style={styles.appNumber}>App #: TCC-2026-08492</Text>
          </View>
          <ShieldCheck size={18} color="#16A34A" />
        </View>

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Track / Program:</Text>
          <Text style={styles.metaValue}>BS Information Technology</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Schedule:</Text>
          <Text style={styles.metaValue}>Batch 1 · 08:00 AM - 09:30 AM</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Assigned Room:</Text>
          <Text style={styles.metaValue}>Computer Laboratory 1</Text>
        </View>
      </View>

      {/* Gmail Input Card */}
      <View style={styles.emailCard}>
        <Text style={styles.emailLabel}>Registered Gmail Address</Text>
        <View style={styles.emailInputBox}>
          <Mail size={13} color="#7A6E62" />
          <Text style={styles.emailText}>juandelacruz@gmail.com</Text>
        </View>
        <Text style={styles.emailHint}>Results will be sent to this email upon grading.</Text>
      </View>

      {/* Academic Agreement (Interactive Checkbox) */}
      <Pressable style={styles.agreementRow} onPress={() => setAgreed(!agreed)}>
        {agreed ? (
          <CheckSquare size={16} color="#7A1F2B" />
        ) : (
          <Square size={16} color="#7A6E62" />
        )}
        <Text style={styles.agreementText}>
          I confirm my identity and agree to follow all TCC Examination Rules & Regulations.
        </Text>
      </Pressable>

      {/* CTA Button */}
      <View style={styles.ctaWrap}>
        <Pressable
          style={[styles.continueBtn, !agreed && styles.continueBtnDisabled]}
          onPress={onConfirm}
        >
          <Text style={styles.continueBtnText}>Confirm & Continue</Text>
        </Pressable>
        <TouchPointer x={145} y={22} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    padding: 14,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  stepperText: {
    fontSize: 9.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  screenTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  passkeyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF5EE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C5E0CF',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  passkeyLabel: {
    fontSize: 9.5,
    color: '#1B6B3A',
    fontFamily: 'Poppins_500Medium',
  },
  passkeyValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1B6B3A',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  studentCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 5,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7A1F2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  studentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  appNumber: {
    fontSize: 9,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8DFD3',
    marginVertical: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 9,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  metaValue: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  emailCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 4,
  },
  emailLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  emailInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF7F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD2C4',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  emailText: {
    fontSize: 10.5,
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  emailHint: {
    fontSize: 8.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
  },
  agreementText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 13,
    color: '#554A40',
    fontFamily: 'Poppins_400Regular',
  },
  ctaWrap: {
    position: 'relative',
    marginTop: 4,
  },
  continueBtn: {
    backgroundColor: '#7A1F2B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
