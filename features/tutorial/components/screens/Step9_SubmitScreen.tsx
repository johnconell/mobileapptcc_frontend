import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CheckCircle2, AlertTriangle, Send } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step9SubmitScreenProps {
  onConfirmSubmit?: () => void;
}

export const Step9_SubmitScreen: React.FC<Step9SubmitScreenProps> = ({ onConfirmSubmit }) => {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <View style={styles.container}>
      {/* Background Dimmed Overlay */}
      <View style={styles.dialogCard}>
        {/* Header Icon */}
        <View style={styles.iconWrap}>
          <Send size={20} color="#7A1F2B" />
        </View>

        <Text style={styles.dialogTitle}>Submit Examination?</Text>
        <Text style={styles.dialogSub}>
          Please verify your test summary before submitting your final responses.
        </Text>

        {/* Breakdown Chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chipAnswered}>
            <CheckCircle2 size={12} color="#16A34A" />
            <Text style={styles.chipTextAnswered}>48 Answered</Text>
          </View>
          <View style={styles.chipFlagged}>
            <AlertTriangle size={12} color="#D97706" />
            <Text style={styles.chipTextFlagged}>2 Flagged</Text>
          </View>
          <View style={styles.chipUnanswered}>
            <Text style={styles.chipTextUnanswered}>0 Unanswered</Text>
          </View>
        </View>

        {/* LAN Transmission Notice */}
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ Single Attempt Policy</Text>
          <Text style={styles.warningText}>
            Submitting will permanently lock your answers. Your answers will be submitted to the
            proctor over LAN without needing internet or a second submission.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.reviewBtn}>
            <Text style={styles.reviewBtnText}>Review Items</Text>
          </Pressable>

          <Pressable
            style={styles.submitBtn}
            onPress={() => {
              setConfirmed(true);
              onConfirmSubmit?.();
            }}
          >
            <Text style={styles.submitBtnText}>Confirm Submit</Text>
          </Pressable>
        </View>

        <TouchPointer x={175} y={230} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(44, 36, 28, 0.45)',
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogCard: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#FFFDF8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 16,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5E8EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  dialogSub: {
    fontSize: 9.5,
    color: '#7A6E62',
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    lineHeight: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 2,
  },
  chipAnswered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAF5EE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  chipTextAnswered: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#15803D',
  },
  chipFlagged: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  chipTextFlagged: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#B45309',
  },
  chipUnanswered: {
    backgroundColor: '#EDEEF4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  chipTextUnanswered: {
    fontSize: 8.5,
    color: '#7A6E62',
  },
  warningBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 8,
    gap: 2,
  },
  warningTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C2410C',
    fontFamily: 'Poppins_600SemiBold',
  },
  warningText: {
    fontSize: 8,
    lineHeight: 11,
    color: '#7C2D12',
    fontFamily: 'Poppins_400Regular',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginTop: 4,
  },
  reviewBtn: {
    flex: 1,
    backgroundColor: '#F5EFE6',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  reviewBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  submitBtn: {
    flex: 1.2,
    backgroundColor: '#7A1F2B',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
});
