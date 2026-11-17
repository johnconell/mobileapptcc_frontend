import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import {
  proctorLoginSchema,
  type ProctorLoginValues,
} from '@/features/authentication/validation/proctorLoginSchema';
import { useHardwareBack } from '@/shared/hooks/useHardwareBack';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { colors } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userFacingError } from '@/shared/utils/userFacingError';

export default function ProctorLoginScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const usernameInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      void (async () => {
        try {
          const { restoreProctorDestination } = await import(
            '@/features/examinations/services/restoreProctorDestination'
          );
          const destination = await restoreProctorDestination();
          if (destination.recoveryMessage) {
            Alert.alert('Room recovery', destination.recoveryMessage);
          }
          router.replace(destination.route as any);
        } catch (error) {
          console.warn('[PROCTOR LOGIN] Room restoration failed:', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
          Alert.alert(
            'Room recovery',
            userFacingError(error, 'Unable to restore the previous room. Your saved room data was not cleared. Open the dashboard and retry.'),
          );
          router.replace('/(proctor)/(tabs)/dashboard');
        }
      })();
    }
  }, [profile, router]);

  useFocusEffect(
    useCallback(() => {
      setShowPassword(false);
    }, []),
  );

  const goToLanding = useCallback(() => {
    // Replace the nested proctor route instead of popping history. A previous
    // schedule screen can still be underneath the login screen after logout.
    router.replace({ pathname: '/', params: { stay: '1', from: 'login' } });
  }, [router]);

  useHardwareBack(() => {
    goToLanding();
    return true;
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProctorLoginValues>({
    resolver: zodResolver(proctorLoginSchema),
    defaultValues: { username: '', password: '' },
  });

  const completeLogin = useCallback(
    (profile: NonNullable<Awaited<ReturnType<typeof AuthRepository.login>>['profile']>) => {
      setProfile(profile);
    },
    [setProfile],
  );

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const result = await AuthRepository.login(values.username, values.password);
      if (!result.success || !result.profile) {
        setFormError(result.message ?? 'Login failed');
        return;
      }
      completeLogin(result.profile);
    } finally {
      submittingRef.current = false;
    }
  });

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((current) => !current);
    requestAnimationFrame(() => passwordInput.current?.focus());
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          onPress={goToLanding}
          style={[
            styles.backButton,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.cardBorder,
            },
          ]}
          hitSlop={10}
        >
          <ArrowLeft size={21} color={themeColors.textPrimary} />
        </Pressable>

        <View style={styles.form}>
          <View
            style={[
              styles.logoFrame,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FBF7F1',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#7B102033',
              },
            ]}
          >
            <Image
              source={require('../../assets/tcc-logo.png')}
              style={[styles.logo, isDark && { opacity: 0.9 }]}
              accessibilityLabel="Tagoloan Community College seal"
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: themeColors.accent }]}>Proctor Sign In</Text>
          <Text style={[styles.sub, { color: themeColors.textSecondary }]}>
            Authorized proctor access only. Sign in with your assigned account.
          </Text>

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Username"
                placeholder="Enter your username"
                ref={usernameInput}
                autoCapitalize="none"
                autoComplete="username"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInput.current?.focus()}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.username?.message}
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.cardMuted,
                    borderColor: themeColors.cardBorder,
                    color: themeColors.textPrimary,
                  },
                ]}
              />
            )}
          />
          <View style={{ height: 14 }} />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Password"
                placeholder="••••••••"
                ref={passwordInput}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                returnKeyType="done"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                onSubmitEditing={onSubmit}
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.cardMuted,
                    borderColor: themeColors.cardBorder,
                    color: themeColors.textPrimary,
                  },
                ]}
                rightAccessory={
                  <Pressable
                    onPress={togglePasswordVisibility}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityState={{ selected: showPassword }}
                    hitSlop={10}
                    style={styles.eyeButton}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={themeColors.textSecondary} />
                    ) : (
                      <Eye size={20} color={themeColors.textSecondary} />
                    )}
                  </Pressable>
                }
              />
            )}
          />

          {formError ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
              {formError}
            </Text>
          ) : null}

          <Button
            title="Sign In"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={onSubmit}
            style={{ marginTop: 18 }}
          />

        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: themeColors.textSecondary }]}>
            Looking for the examination home screen?
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={goToLanding}
            hitSlop={8}
          >
            <Text style={[styles.footerLink, { color: themeColors.accent }]}>
              Return to the public portal
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: colors.white,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: 20,
  },
  logoFrame: {
    width: 68,
    height: 68,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#7B102033',
    backgroundColor: '#FBF7F1',
    marginBottom: 16,
  },
  logo: { width: '100%', height: '100%', borderRadius: 30 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 9,
    borderColor: '#D1D5DB',
    backgroundColor: colors.white,
    fontSize: 14,
  },
  eyeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
  footer: { alignItems: 'center', paddingTop: 12 },
  footerText: { fontSize: 12, textAlign: 'center' },
  footerLink: {
    marginTop: 4,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
