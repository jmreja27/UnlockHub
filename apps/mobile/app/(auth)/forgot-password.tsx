import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { api } from '../../lib/api';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: (emailValue: string) =>
      api.post<{ ok: boolean }>('/api/v1/auth/forgot-password', { email: emailValue }),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  function handleSubmit() {
    setEmailError(null);
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('auth.forgot_password.error_invalid_email'));
      return;
    }
    mutation.mutate(trimmed);
  }

  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 px-8 justify-center items-center">
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📬</Text>
          <Text className="text-white text-2xl font-bold text-center mb-3" accessibilityRole="header">
            {t('auth.forgot_password.success_title')}
          </Text>
          <Text className="text-gray-400 text-sm text-center leading-6 mb-10">
            {t('auth.forgot_password.success_body')}
          </Text>
          <Pressable
            className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel={t('auth.forgot_password.back_to_login')}
            style={{ minHeight: 52 }}
          >
            <Text className="text-white font-semibold text-base">
              {t('auth.forgot_password.back_to_login')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            className="mb-8 self-start"
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-primary-light text-base">{t('common.back')}</Text>
          </Pressable>

          <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
            {t('auth.forgot_password.title')}
          </Text>
          <Text className="text-gray-400 text-sm mb-8 leading-6">
            {t('auth.forgot_password.subtitle')}
          </Text>

          <Text className="text-gray-300 text-sm mb-2">
            {t('auth.forgot_password.email_label')}
          </Text>
          <TextInput
            className={`bg-surface-elevated text-white rounded-xl px-4 py-3 mb-1 text-sm ${
              emailError ? 'border border-red-500' : ''
            }`}
            placeholder={t('auth.forgot_password.email_placeholder')}
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={(v) => { setEmail(v); setEmailError(null); }}
            accessibilityLabel={t('auth.forgot_password.email_label')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!mutation.isPending}
          />

          {emailError ? (
            <Text
              className="text-red-400 text-xs mb-6"
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {emailError}
            </Text>
          ) : (
            <View className="mb-6" />
          )}

          <Pressable
            className={`w-full rounded-xl py-4 items-center active:opacity-80 ${
              mutation.isPending ? 'bg-primary/70' : 'bg-primary'
            }`}
            onPress={handleSubmit}
            disabled={mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('auth.forgot_password.cta')}
            accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
            style={{ minHeight: 52 }}
          >
            {mutation.isPending ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#ffffff" size="small" />
                <Text className="text-white font-semibold ml-2">
                  {t('auth.forgot_password.loading')}
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-base">
                {t('auth.forgot_password.cta')}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
