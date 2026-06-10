import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { api, ApiRequestError } from '../lib/api';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: (newPassword: string) =>
      api.post<{ ok: boolean }>('/api/v1/auth/reset-password', {
        token,
        password: newPassword,
      }),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError && err.apiError.code === 'INVALID_RESET_TOKEN') {
        setError(t('auth.reset_password.error_invalid_token'));
      } else {
        setError(t('auth.reset_password.error_generic'));
      }
    },
  });

  function handleSubmit() {
    setError(null);
    if (!password || password.length < 8) {
      setError(t('auth.reset_password.error_generic'));
      return;
    }
    mutation.mutate(password);
  }

  if (!token) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 px-8 justify-center items-center">
          <Text className="text-red-400 text-base text-center">
            {t('auth.reset_password.error_invalid_token')}
          </Text>
          <Pressable
            className="mt-6 bg-primary rounded-xl py-3 px-8 items-center"
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button"
            style={{ minHeight: 48 }}
          >
            <Text className="text-white font-semibold">{t('auth.forgot_password.back_to_login')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 px-8 justify-center items-center">
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
          <Text className="text-white text-2xl font-bold text-center mb-3" accessibilityRole="header">
            {t('auth.reset_password.success_title')}
          </Text>
          <Text className="text-gray-400 text-sm text-center leading-6 mb-10">
            {t('auth.reset_password.success_body')}
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
          <Text className="text-white text-2xl font-bold mb-2 mt-8" accessibilityRole="header">
            {t('auth.reset_password.title')}
          </Text>
          <Text className="text-gray-400 text-sm mb-8 leading-6">
            {t('auth.reset_password.subtitle')}
          </Text>

          <Text className="text-gray-300 text-sm mb-2">
            {t('auth.reset_password.password_label')}
          </Text>
          <TextInput
            className={`bg-surface-elevated text-white rounded-xl px-4 py-3 mb-1 text-sm ${
              error ? 'border border-red-500' : ''
            }`}
            placeholder={t('auth.reset_password.password_placeholder')}
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={(v) => { setPassword(v); setError(null); }}
            accessibilityLabel={t('auth.reset_password.password_label')}
            secureTextEntry
            autoCapitalize="none"
            editable={!mutation.isPending}
          />

          {error ? (
            <Text
              className="text-red-400 text-xs mb-6"
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {error}
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
            accessibilityLabel={t('auth.reset_password.cta')}
            accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
            style={{ minHeight: 52 }}
          >
            {mutation.isPending ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#ffffff" size="small" />
                <Text className="text-white font-semibold ml-2">
                  {t('auth.reset_password.loading')}
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-base">
                {t('auth.reset_password.cta')}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
