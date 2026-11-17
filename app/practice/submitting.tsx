import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, FileText, ShieldCheck, X } from 'lucide-react-native';
import { ExamProcessChrome } from '@/features/examinations/components/ExamProcessChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

export default function PracticeSubmittingScreen() {
  const router = useRouter();
  const { colors: themeColors, isDark } = useAppTheme();
  const applicant = usePracticeStore((s) => s.applicant);
  const receipt = usePracticeStore((s) => s.receipt);
  const answers = usePracticeStore((s) => s.answers);
  const questions = usePracticeStore((s) => s.questions);

  const [delivering, setDelivering] = useState(true);
  const [showProofModal, setShowProofModal] = useState(false);

  const answeredCount = Object.values(answers).filter(
    (a) => a && a.selectedAnswer != null,
  ).length;
  const totalQuestions = questions.length;
  const digest = receipt?.verificationDigest || 'DEMO-7A8B-9C0D';

  // Simulate 1.5s delivery animation then show confirmed receipt
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelivering(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Auto-redirect 3.5s after confirmed
  useEffect(() => {
    if (!delivering) {
      const redirectTimer = setTimeout(() => {
        router.replace('/practice/completed' as any);
      }, 3500);
      return () => clearTimeout(redirectTimer);
    }
  }, [delivering, router]);

  const handleFinish = () => {
    router.replace('/practice/completed' as any);
  };

  return (
    <ExamProcessChrome step={5} title="Submission" stepLabel="Step 6 of 6 · Finalize">
      <View style={styles.container}>
        <PracticeBadge
          label="PRACTICE SUBMISSION · SIMULATED"
          sublabel="Local simulation · No real exam records or servers contacted"
        />

        {delivering ? (
          /* State 1: Delivering simulation */
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? themeColors.card : '#FFFFFF',
                borderColor: themeColors.cardBorder,
              },
            ]}
          >
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
              Delivering Practice Examination…
            </Text>

            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              Simulating delivery to examination server (Practice Mode · Attempt 1 of 1)…
            </Text>

            <View
              style={[
                styles.noticeBanner,
                {
                  backgroundColor: isDark ? themeColors.cardMuted : '#F9FAFB',
                  borderColor: isDark ? themeColors.cardBorder : '#E5E7EB',
                },
              ]}
            >
              <Text style={[styles.noticeText, { color: themeColors.textSecondary }]}>
                In Practice Mode, your answers are safely processed locally without internet or proctor servers.
              </Text>
            </View>
          </View>
        ) : (
          /* State 2: Confirmed Success */
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? themeColors.successMuted : '#F0FDF4',
                borderColor: themeColors.success,
              },
            ]}
          >
            <View style={styles.iconCircleSuccess}>
              <CheckCircle2 color={themeColors.success} size={42} strokeWidth={2.5} />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
              Examination Submitted Successfully
            </Text>

            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              Your practice examination answers were simulated and verified locally.
            </Text>

            {/* Demo Receipt */}
            <View
              style={[
                styles.receiptBox,
                {
                  backgroundColor: isDark ? themeColors.cardMuted : '#FFFFFF',
                  borderColor: isDark ? themeColors.cardBorder : '#E5E7EB',
                },
              ]}
            >
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Status</Text>
                <Text style={[styles.receiptValue, { color: themeColors.success }]}>
                  Confirmed (Practice Demo)
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Destination</Text>
                <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                  Practice Simulation (Isolated)
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Demo Receipt Code</Text>
                <Text style={[styles.receiptValueMono, { color: themeColors.accent }]}>
                  {digest}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Answers Recorded</Text>
                <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                  {answeredCount} of {totalQuestions}
                </Text>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => setShowProofModal(true)}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: themeColors.cardBorder,
                    backgroundColor: isDark ? themeColors.cardMuted : '#FFFFFF',
                  },
                ]}
              >
                <FileText size={16} color={themeColors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryButtonText, { color: themeColors.textPrimary }]}>
                  View Proof
                </Text>
              </Pressable>

              <Pressable
                onPress={handleFinish}
                style={[styles.primaryButton, { backgroundColor: themeColors.success }]}
              >
                <Text style={[styles.buttonText, { color: isDark ? themeColors.card : '#FFFFFF' }]}>
                  Complete &amp; Finish
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Proctor Proof & Assistance Modal */}
      <Modal visible={showProofModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? themeColors.modal : '#FFFFFF',
                borderColor: themeColors.cardBorder,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShieldCheck size={20} color={themeColors.accent} style={{ marginRight: 8 }} />
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  Submission Proof (Demo)
                </Text>
              </View>
              <Pressable onPress={() => setShowProofModal(false)} hitSlop={12}>
                <X size={20} color={themeColors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320, marginVertical: 8 }}>
              <Text style={[styles.modalInstruction, { color: themeColors.textSecondary }]}>
                In the actual examination, you can show this receipt screen to your proctor as verification of your submitted answers.
              </Text>

              <View
                style={[
                  styles.proofDetailsBox,
                  {
                    backgroundColor: isDark ? themeColors.cardMuted : '#F9FAFB',
                    borderColor: isDark ? themeColors.cardBorder : '#E5E7EB',
                  },
                ]}
              >
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Candidate</Text>
                  <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                    {applicant.fullName}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Applicant Code</Text>
                  <Text style={[styles.receiptValueMono, { color: themeColors.textPrimary }]}>
                    {applicant.studentId}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Answers Recorded</Text>
                  <Text style={[styles.receiptValue, { color: themeColors.success }]}>
                    {answeredCount} of {totalQuestions} answered
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: themeColors.textSecondary }]}>Verification Digest</Text>
                  <Text style={[styles.receiptValueMono, { color: themeColors.accent }]}>
                    {digest}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setShowProofModal(false)}
              style={[styles.primaryButton, { backgroundColor: themeColors.accent, marginTop: 8 }]}
            >
              <Text style={[styles.buttonText, { color: isDark ? themeColors.card : '#FFFFFF' }]}>
                Dismiss
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ExamProcessChrome>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  spinnerContainer: {
    marginBottom: 16,
  },
  iconCircleSuccess: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  receiptBox: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  noticeBanner: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  receiptLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  receiptValueMono: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    flex: 0.9,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalInstruction: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  proofDetailsBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
});
