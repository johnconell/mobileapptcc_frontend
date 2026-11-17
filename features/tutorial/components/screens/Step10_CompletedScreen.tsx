import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CheckCircle2, Mail, ShieldCheck, Award } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step10CompletedScreenProps {
  onFinish?: () => void;
}

export const Step10_CompletedScreen: React.FC<Step10CompletedScreenProps> = ({ onFinish }) => {
  return (
    <View style={styles.container}>
      {/* Success Celebration Graphic */}
      <View style={styles.hero}>
        <View style={styles.successIconCircle}>
          <ShieldCheck size={36} color="#15803D" strokeWidth={2.5} />
        </View>
        <Text style={styles.successTitle}>Examination Submitted Successfully</Text>
        <Text style={styles.successSub}>
          Your answers were verified and recorded by Proctor Room 102.
        </Text>
      </View>

      {/* Security Cleanup & Unpin Card */}
      <View style={styles.card}>
        <View style={styles.checkItem}>
          <CheckCircle2 size={13} color="#16A34A" />
          <Text style={styles.checkText}>Screen unpinned successfully</Text>
        </View>
        <View style={styles.checkItem}>
          <CheckCircle2 size={13} color="#16A34A" />
          <Text style={styles.checkText}>Local examination cache cleared</Text>
        </View>
        <View style={styles.checkItem}>
          <CheckCircle2 size={13} color="#16A34A" />
          <Text style={styles.checkText}>Proctor received all 50 answers</Text>
        </View>
      </View>

      {/* Gmail Results Notice Card */}
      <View style={styles.gmailCard}>
        <View style={styles.gmailHeader}>
          <Mail size={15} color="#7A1F2B" />
          <Text style={styles.gmailTitle}>Check Your Gmail Account</Text>
        </View>
        <Text style={styles.gmailBody}>
          Your official examination results and category score report will be emailed to{' '}
          <Text style={styles.gmailHighlight}>juandelacruz@gmail.com</Text>.
        </Text>
      </View>

      {/* Ready to Begin Action */}
      <View style={styles.ctaWrap}>
        <Pressable style={styles.getStartedBtn} onPress={onFinish}>
          <Award size={16} color="#FFFFFF" />
          <Text style={styles.getStartedText}>Get Started — Take Exam</Text>
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
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1410',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  successSub: {
    fontSize: 9.5,
    color: '#7A6E62',
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    lineHeight: 13,
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkText: {
    fontSize: 9.5,
    color: '#332A22',
    fontFamily: 'Poppins_500Medium',
  },
  gmailCard: {
    backgroundColor: '#FFF5F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCE7E9',
    padding: 10,
    gap: 4,
  },
  gmailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gmailTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7A1F2B',
    fontFamily: 'Poppins_600SemiBold',
  },
  gmailBody: {
    fontSize: 9,
    lineHeight: 13,
    color: '#554A40',
    fontFamily: 'Poppins_400Regular',
  },
  gmailHighlight: {
    fontWeight: '700',
    color: '#7A1F2B',
  },
  ctaWrap: {
    position: 'relative',
    marginTop: 4,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingVertical: 11,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  getStartedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
