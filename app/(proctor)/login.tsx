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
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ArrowLeft } from 'lucide-react-native';
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

WebBrowser.maybeCompleteAuthSession();

export default function ProctorLoginScreen() {
  const { colors: themeColors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [googleRequest, , promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

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
  const [formError, setFormError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const goToLanding = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
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
    setFormError(null);
    const result = await AuthRepository.login(values.username, values.password);
    if (!result.success || !result.profile) {
      setFormError(result.message ?? 'Login failed');
      return;
    }
    completeLogin(result.profile);
  });

  const onGoogle = useCallback(async () => {
    setFormError(null);
    if (
      !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID &&
      !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
      !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ) {
      setFormError('Google sign-in is not configured for this app. Please contact the administrator.');
      return;
    }
    if (!googleRequest) {
      setFormError('Google sign-in is not ready. Check your connection and try again.');
      return;
    }

    setGoogleLoading(true);
    try {
      const response = await promptGoogleSignIn();
      if (response.type === 'cancel' || response.type === 'dismiss') {
        setFormError('Google sign-in was cancelled.');
        return;
      }
      if (response.type === 'error') {
        setFormError('Google sign-in could not be completed. Please try again.');
        return;
      }
      if (response.type !== 'success') {
        setFormError('Google sign-in did not complete. Please try again.');
        return;
      }

      const idToken = response.params.id_token;
      if (!idToken) {
        setFormError('Google did not return a verified sign-in token. Please try again.');
        return;
      }

      const result = await AuthRepository.loginWithGoogleIdToken(idToken);
      if (!result.success || !result.profile) {
        setFormError(result.message ?? 'Google sign-in failed.');
        return;
      }
      completeLogin(result.profile);
    } catch (error) {
      console.warn('[PROCTOR LOGIN] Google sign-in failed:', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      setFormError(userFacingError(error, 'Google sign-in is unavailable. Connect to the internet and try again.'));
    } finally {
      setGoogleLoading(false);
    }
  }, [completeLogin, googleRequest, promptGoogleSignIn]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: themeColors.card }]}
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
          style={styles.backButton}
          hitSlop={10}
        >
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>

        <View style={styles.form}>
          <View style={styles.logoFrame}>
            <Image
              source={require('../../assets/tcc-logo.png')}
              style={styles.logo}
              accessibilityLabel="Tagoloan Community College seal"
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: colors.primary }]}>Proctor Sign In</Text>
          <Text style={[styles.sub, { color: themeColors.textSecondary }]}>
            Authorized proctor access only. Sign in with your assigned account.
          </Text>

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email"
                placeholder="proctor@example.com"
                ref={emailInput}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInput.current?.focus()}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.username?.message}
                style={styles.input}
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
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="done"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                onSubmitEditing={onSubmit}
                style={styles.input}
              />
            )}
          />

          {formError ? (
            <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>
          ) : null}

          <Button
            title="Sign In"
            size="lg"
            fullWidth
            disabled={googleLoading}
            loading={isSubmitting}
            onPress={onSubmit}
            style={{ marginTop: 18 }}
          />

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.cardBorder }]} />
            <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.cardBorder }]} />
          </View>

          <Button
            title="Continue with Google"
            variant="outline"
            size="lg"
            fullWidth
            disabled={isSubmitting}
            loading={googleLoading}
            onPress={() => void onGoogle()}
            style={{ marginTop: 14 }}
            icon={<Text style={styles.googleMark}>G</Text>}
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
            <Text style={styles.footerLink}>Return to the public portal</Text>
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
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
  googleMark: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  dividerLine: { height: 1, flex: 1 },
  dividerText: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
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
