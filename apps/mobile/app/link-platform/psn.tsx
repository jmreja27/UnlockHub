import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, ApiRequestError } from '../../lib/api';
import type { PlatformAccount } from '@unlockhub/types';

export default function LinkPsnScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [npsso, setNpsso] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: (npssoToken: string) =>
      api.post<PlatformAccount>('/api/v1/platforms/psn/link', { npsso: npssoToken }),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });
      Alert.alert(t('link_platform.psn.success'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 400) {
          setFieldError(t('link_platform.psn.error_invalid'));
          return;
        }
      }
      setFieldError(t('common.error_generic'));
    },
  });

  function handleSubmit() {
    setFieldError(null);
    const trimmed = npsso.trim();
    if (!trimmed) {
      setFieldError(t('link_platform.psn.error_empty'));
      return;
    }
    if (trimmed.length < 64) {
      setFieldError(t('link_platform.psn.error_invalid'));
      return;
    }
    linkMutation.mutate(trimmed);
  }

  return (
    <SafeAreaView
      className="flex-1 bg-gray-950"
      accessibilityLabel={t('link_platform.psn.title')}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabecera */}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          accessibilityHint={t('auth.register.back_hint')}
          className="mb-6 self-start"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-blue-400 text-base">{t('common.back')}</Text>
        </Pressable>

        <Text
          className="text-white text-2xl font-bold mb-2"
          accessibilityRole="header"
        >
          {t('link_platform.psn.title')}
        </Text>

        <Text className="text-gray-400 text-sm mb-6">
          {t('link_platform.psn.description')}
        </Text>

        {/* Instrucciones paso a paso */}
        <View
          className="bg-gray-800 rounded-xl p-4 mb-6"
          accessible={true}
          accessibilityLabel={[
            t('link_platform.psn.step1'),
            t('link_platform.psn.step2'),
            t('link_platform.psn.step3'),
          ].join(' ')}
        >
          <Text className="text-gray-300 text-sm mb-2">{t('link_platform.psn.step1')}</Text>
          <Text className="text-gray-300 text-sm mb-2">{t('link_platform.psn.step2')}</Text>
          <Text className="text-gray-300 text-sm">{t('link_platform.psn.step3')}</Text>
        </View>

        {/* Campo NPSSO */}
        <Text
          className="text-gray-300 text-sm mb-2"
          accessibilityRole="none"
        >
          {t('link_platform.psn.npsso_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-1 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.psn.npsso_placeholder')}
          placeholderTextColor="#6b7280"
          value={npsso}
          onChangeText={(v) => { setNpsso(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.psn.npsso_label')}
          accessibilityHint={t('link_platform.psn.npsso_hint')}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={false}
          multiline={false}
          editable={!linkMutation.isPending}
        />

        {fieldError ? (
          <Text
            className="text-red-400 text-xs mb-4"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {fieldError}
          </Text>
        ) : (
          <View className="mb-4" />
        )}

        {/* Nota de privacidad */}
        <View
          className="bg-gray-900 border border-gray-700 rounded-xl p-3 mb-6"
          accessible={true}
          accessibilityLabel={t('link_platform.psn.privacy_note')}
        >
          <Text className="text-gray-500 text-xs">{t('link_platform.psn.privacy_note')}</Text>
        </View>

        {/* Botón de envío */}
        <Pressable
          onPress={handleSubmit}
          disabled={linkMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('link_platform.psn.submit_label')}
          accessibilityState={{ disabled: linkMutation.isPending, busy: linkMutation.isPending }}
          className={`rounded-xl py-4 items-center ${
            linkMutation.isPending ? 'bg-blue-800' : 'bg-blue-600'
          }`}
          style={{ minHeight: 44 }}
        >
          {linkMutation.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text
                className="text-white font-semibold ml-2"
                accessibilityLiveRegion="polite"
              >
                {t('link_platform.psn.loading')}
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('link_platform.psn.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
