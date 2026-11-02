import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AppState,
  Text,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  FileText,
  X,
} from 'lucide-react-native';
import { ExamProcessChrome } from '@/features/examinations/components/ExamProcessChrome';
import {
  ExamSubmissionCoordinator,
  generateSubmissionDigest,
} from '@/features/examinations/services/examSubmissionCoordinator';
import {
  ExamSubmissionStore,
  type FinalizedSubmission,
} from '@/features/examinations/services/examSubmissionStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

export default function SubmittingScreen() {
  useKeepAwake();
  const router = useRouter();
  const { colors: themeColors, isDark } = useAppTheme();

  const [submission, setSubmission] = useState<FinalizedSubmission | null>(null);
  const [isDelivering, setIsDelivering] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);

  // 1. Subscribe to submission coordinator updates
  useEffect(() => {
    let active = true;

    void (async () => {
      const current = await ExamSubmissionCoordinator.getActiveSubmission();
      if (active && current) {
        setSubmission(current);
      }
    })();

    const unsubscribe = ExamSubmissionCoordinator.subscribe((updated) => {
      if (active) {
        setSubmission(updated);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      ExamSubmissionCoordinator.cancelScheduledRetry();
    };
  }, []);

  // 2. Trigger initial delivery if submission is pending or retrying
  useEffect(() => {
    let active = true;
    void (async () => {
      const current = await ExamSubmissionCoordinator.getActiveSubmission();
      if (!current) {
        // If no submission is stored, check if already completed in store
        const store = useExamStore.getState();
        if (store.submittedAt) {
          router.replace({
            pathname: '/',
            params: { examExitNotice: 'Your answers were submitted successfully.' },
          } as any);
        }
        return;
      }
      if (current.status !== 'confirmed') {
        setIsDelivering(true);
        try {
          await ExamSubmissionCoordinator.deliver();
        } finally {
          if (active) setIsDelivering(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  // 3. Countdown timer for retrying state
  useEffect(() => {
    if (submission?.status !== 'retrying' || !submission.nextRetryAt) {
      setCountdownSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const diffMs = (submission.nextRetryAt ?? 0) - Date.now();
      const seconds = Math.max(0, Math.ceil(diffMs / 1000));
      setCountdownSeconds(seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [submission?.status, submission?.nextRetryAt]);

  // 4. Heartbeat keeping connection open
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const heartbeat = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await LobbyRepository.sendHeartbeat();
      } finally {
        inFlight = false;
      }
    };

    void heartbeat();
    const interval = setInterval(() => void heartbeat(), 10_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat();
    });

    return () => {
      active = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, []);

  // 5. Auto-redirect upon confirmation
  useEffect(() => {
    if (submission?.status === 'confirmed') {
      const timer = setTimeout(() => {
        handleExit();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [submission?.status]);

  const handleManualRetry = useCallback(async () => {
    if (isDelivering) return;
    setIsDelivering(true);
    try {
      await ExamSubmissionCoordinator.deliver({ isManualRetry: true });
    } finally {
      setIsDelivering(false);
    }
  }, [isDelivering]);

  const handleExit = useCallback(async () => {
    useExamStore.getState().reset();
    useStudentStore.getState().reset();
    useLobbyStore.getState().reset();

    const exitNotice =
      submission?.finalReason === 'time_expired'
        ? 'Your time ended and your examination was confirmed.'
        : submission?.finalReason === 'proctor_terminated'
          ? 'The proctor ended the examination and your answers were confirmed.'
          : 'Your answers were submitted successfully.';

    router.replace({ pathname: '/', params: { examExitNotice: exitNotice } } as any);
  }, [router, submission?.finalReason]);

  const verificationDigest = useMemo(() => {
    return submission ? generateSubmissionDigest(submission) : '----';
  }, [submission]);

  const answeredCount = useMemo(() => {
    if (!submission?.answers) return 0;
    return Object.values(submission.answers).filter((a) => a != null && a !== '').length;
  }, [submission?.answers]);

  const totalQuestions = useMemo(() => {
    if (!submission?.answers) return 0;
    return Object.keys(submission.answers).length;
  }, [submission?.answers]);

  const destinationLabel = useMemo(() => {
    if (!submission) return 'Examination Destination';
    if (submission.destination === 'proctor_peer') {
      return 'Proctor Server (Local LAN)';
    }
    if (submission.destination === 'cloud') {
      return 'Campus Cloud Backend';
    }
    return 'Offline Local Store';
  }, [submission]);

  return (
    <ExamProcessChrome step={5} title="Submission" stepLabel="Step 6 of 6 · Finalize">
      <View style={styles.container}>
        {/* State 1: Confirmed Success */}
        {submission?.status === 'confirmed' ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? '#18241C' : '#F0FDF4',
                borderColor: themeColors.success,
              },
            ]}
          >
            <View style={styles.iconCircleSuccess}>
              <CheckCircle2 color={themeColors.success} size={42} strokeWidth={2.5} />
            </View>

            <Text style={[styles.title, { color: isDark ? '#E5E7EB' : '#111827' }]}>
              Submission Confirmed!
            </Text>

            <Text style={[styles.description, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>
              {submission.receipt?.destination === 'proctor_peer'
                ? 'Your answers were received and graded by the proctor phone. They will sync to the central system.'
                : 'Your answers were successfully received and confirmed by the examination system.'}
            </Text>

            <View
              style={[
                styles.receiptBox,
                {
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                },
              ]}
            >
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Status</Text>
                <Text style={[styles.receiptValue, { color: themeColors.success }]}>
                  {submission.receipt?.alreadySubmitted ? 'Confirmed (Duplicate ACK)' : 'Confirmed'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Destination</Text>
                <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                  {destinationLabel}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Receipt Code</Text>
                <Text style={[styles.receiptValueMono, { color: themeColors.accent }]}>
                  {verificationDigest}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Answers Saved</Text>
                <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                  {answeredCount} of {totalQuestions}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleExit}
              style={[styles.primaryButton, { backgroundColor: themeColors.success }]}
            >
              <Text style={styles.buttonText}>Complete & Finish</Text>
            </Pressable>
          </View>
        ) : submission?.status === 'action_required' ? (
          /* State 2: Action Required / Terminal Error / Max Retries Exceeded */
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? '#261C1C' : '#FEF2F2',
                borderColor: themeColors.danger,
              },
            ]}
          >
            <View style={styles.iconCircleError}>
              <AlertTriangle color={themeColors.danger} size={42} strokeWidth={2.2} />
            </View>

            <Text style={[styles.title, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>
              Delivery Requires Attention
            </Text>

            <Text style={[styles.description, { color: isDark ? '#E5E7EB' : '#374151' }]}>
              {submission.lastError?.message ||
                'Unable to confirm delivery to the examination server after multiple attempts.'}
            </Text>

            <View
              style={[
                styles.noticeBanner,
                {
                  backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                },
              ]}
            >
              <ShieldCheck size={18} color={themeColors.success} style={{ marginRight: 8 }} />
              <Text style={[styles.noticeText, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>
                Your examination answers are safely preserved on this device.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleManualRetry}
                disabled={isDelivering}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: themeColors.accent,
                    opacity: isDelivering ? 0.6 : 1,
                  },
                ]}
              >
                {isDelivering ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.buttonText}>Retry Delivery</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => setShowProofModal(true)}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: themeColors.cardBorder,
                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  },
                ]}
              >
                <FileText size={16} color={themeColors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryButtonText, { color: themeColors.textPrimary }]}>
                  Proctor Assistance
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* State 3: Pending or Bounded Retrying in Progress */
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? '#1F2430' : '#FFFFFF',
                borderColor: themeColors.cardBorder,
              },
            ]}
          >
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
              {submission?.status === 'retrying'
                ? 'Re-attempting Submission…'
                : 'Delivering Examination…'}
            </Text>

            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              {submission?.status === 'retrying' && countdownSeconds !== null
                ? `Connection paused. Automatically retrying in ${countdownSeconds}s (Attempt ${submission.attemptCount + 1} of ${submission.maxAttempts})…`
                : `Communicating with ${destinationLabel} (Attempt ${(submission?.attemptCount ?? 0) + 1} of ${submission?.maxAttempts ?? 5})…`}
            </Text>

            <View
              style={[
                styles.noticeBanner,
                {
                  backgroundColor: isDark ? '#111827' : '#F9FAFB',
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                },
              ]}
            >
              <Text style={[styles.noticeText, { color: themeColors.textSecondary }]}>
                Please stay on this screen and keep Wi-Fi connected. Your answers are frozen and
                safely stored.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleManualRetry}
                disabled={isDelivering}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: themeColors.accent,
                    opacity: isDelivering ? 0.6 : 1,
                  },
                ]}
              >
                {isDelivering ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.buttonText}>Retry Now</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => setShowProofModal(true)}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: themeColors.cardBorder,
                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  },
                ]}
              >
                <FileText size={16} color={themeColors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryButtonText, { color: themeColors.textPrimary }]}>
                  View Proof
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
                backgroundColor: isDark ? '#1E232A' : '#FFFFFF',
                borderColor: themeColors.cardBorder,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShieldCheck size={20} color={themeColors.accent} style={{ marginRight: 8 }} />
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  Submission Proof
                </Text>
              </View>
              <Pressable onPress={() => setShowProofModal(false)} hitSlop={12}>
                <X size={20} color={themeColors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320, marginVertical: 8 }}>
              <Text style={[styles.modalInstruction, { color: themeColors.textSecondary }]}>
                Show this screen to your examination proctor to verify your finalized answers and
                submission receipt code.
              </Text>

              <View
                style={[
                  styles.proofDetailsBox,
                  {
                    backgroundColor: isDark ? '#111827' : '#F9FAFB',
                    borderColor: isDark ? '#374151' : '#E5E7EB',
                  },
                ]}
              >
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Candidate</Text>
                  <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                    {submission?.studentName || submission?.applicantCode || 'Examinee'}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Applicant Code</Text>
                  <Text style={[styles.receiptValueMono, { color: themeColors.textPrimary }]}>
                    {submission?.applicantCode || '----'}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Attempt ID</Text>
                  <Text style={[styles.receiptValueMono, { color: themeColors.textSecondary }]}>
                    {submission?.attemptId || '----'}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Answers Recorded</Text>
                  <Text style={[styles.receiptValue, { color: themeColors.success }]}>
                    {answeredCount} of {totalQuestions} answered
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Finalized At</Text>
                  <Text style={[styles.receiptValue, { color: themeColors.textPrimary }]}>
                    {submission?.createdAt
                      ? new Date(submission.createdAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '----'}
                  </Text>
                </View>

                <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB', paddingTop: 8 }}>
                  <Text style={[styles.receiptLabel, { marginBottom: 4 }]}>
                    Verification Code (Checksum):
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '800',
                      letterSpacing: 1.5,
                      fontFamily: 'monospace',
                      color: themeColors.accent,
                      textAlign: 'center',
                    }}
                  >
                    {verificationDigest}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setShowProofModal(false)}
              style={[styles.primaryButton, { backgroundColor: themeColors.accent, marginTop: 8 }]}
            >
              <Text style={styles.buttonText}>Dismiss</Text>
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
  iconCircleSuccess: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconCircleError: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  spinnerContainer: {
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
    marginBottom: 20,
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
    flex: 1,
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
