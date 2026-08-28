import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { SkeletonForm } from '@/components/ui/Skeleton';
import { LobbyRepository } from '@/repositories';
import { useStudentStore } from '@/stores';
import { OfflineStore } from '@/services/offlineStore';
import { colors } from '@/theme';

const schema = z.object({
  passkey: z
    .string()
    .trim()
    .min(6, 'Enter your examination key')
    .max(12, 'Examination key is too long')
    .regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only'),
});

type FormValues = z.infer<typeof schema>;

export default function StudentPasskeyScreen() {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setExamPasskey = useStudentStore((s) => s.setExamPasskey);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { passkey: '' },
  });

  React.useEffect(() => {
    if (!scannedSessionId) {
      router.replace('/');
    }
  }, [scannedSessionId, router]);

  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      router.replace('/(student)/lobby');
    }
  }, [verifiedStudent, scannedSessionId, router]);

  if (!scannedSessionId) {
    return (
      <View style={styles.screen}>
        <Header title="Examination Key" subtitle="Loading…" />
        <SkeletonForm fields={1} />
      </View>
    );
  }

  const onContinue = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await LobbyRepository.validatePasskey(values.passkey.trim());
      if (result.classification === 'wrong_schedule') {
        const sched = result.schedule;
        if (sched && (sched.exam_date || sched.time_slot || sched.title)) {
          const parts = [] as string[];
          if (sched.title) parts.push(sched.title);
          if (sched.exam_date) parts.push(sched.exam_date);
          if (sched.time_slot) parts.push(sched.time_slot);
          setError(
            `${result.message || 'This examination key belongs to another schedule.'}\nScheduled: ${parts.join(' · ')}`,
          );
        } else {
          setError(result.message || 'This examination key belongs to a different schedule.');
        }
        return;
      }
      setExamPasskey(values.passkey.trim().toUpperCase());
      if (!result.student) {
        throw new Error(result.message || 'Unable to continue with this examination key.');
      }
      // Prevent repeated attempts: check if this applicant already has a queued or submitted result
      try {
        const results = await OfflineStore.getResults();
        const scheduleId = result.schedule?.id ? Number(result.schedule.id) : null;
        const already = results.find((r) => {
          const matchApplicant = String(r.applicant_code) === String(result.student?.studentId || result.student?.id);
          const matchSchedule = scheduleId ? r.examination_schedule_id === scheduleId : false;
          return matchApplicant && matchSchedule;
        });
        if (already) {
          setError('Examination Already Completed\nYou have already taken this examination. Multiple attempts are not allowed.');
          return;
        }
      } catch {
        // ignore store errors — allow join and rely on server-side checks if uncertain
      }
      setSelectedStudent(result.student);
      router.push('/(student)/confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid examination key.');
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Examination Key"
        subtitle="Enter the key emailed to your Gmail"
        onBack={() => router.replace('/')}
      />
      <View style={styles.content}>
        <Card>
          <View style={styles.iconRow}>
            <KeyRound size={28} color={colors.primary} />
          </View>
          <Text style={styles.intro}>
            Use the unique examination key sent to your Gmail. Do not use another student&apos;s
            key.
          </Text>

          <Controller
            control={control}
            name="passkey"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Examination Key"
                placeholder="e.g. K7M2P9QX"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                value={value}
                onChangeText={(text) => onChange(text.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                onBlur={onBlur}
                error={errors.passkey?.message}
                maxLength={12}
              />
            )}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Continue"
            loading={isSubmitting}
            onPress={onContinue}
            style={styles.btn}
          />
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, flex: 1 },
  iconRow: { alignItems: 'center', marginBottom: 12 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    marginBottom: 18,
    textAlign: 'center',
  },
  error: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    color: '#B42318',
    fontWeight: '600',
  },
  btn: { marginTop: 16 },
});
