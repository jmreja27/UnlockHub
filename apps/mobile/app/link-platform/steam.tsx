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

export default function LinkSteamScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [steamId, setSteamId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: (data: { steamId: string; apiKey: string }) =>
      api.post<PlatformAccount>('/api/v1/platforms/steam/link', data),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });
      void queryClient.invalidateQueries({ queryKey: ['platforms'] });
      Alert.alert(t('link_platform.steam.success'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 400) {
          setFieldError(t('link_platform.steam.error_invalid'));
          return;
        }
        if (err.statusCode === 409) {
          setFieldError(t('link_platform.steam.error_already_linked'));
          return;
        }
      }
      setFieldError(t('common.error_generic'));
    },
  });

  function handleSubmit() {
    setFieldError(null);
    const id = steamId.trim();
    const key = apiKey.trim();

    if (!id) {
      setFieldError(t('link_platform.steam.error_empty_id'));
      return;
    }
    if (!/^\d{17}$/.test(id)) {
      setFieldError(t('link_platform.steam.error_invalid_id'));
      return;
    }
    if (!key) {
      setFieldError(t('link_platform.steam.error_empty_key'));
      return;
    }
    linkMutation.mutate({ steamId: id, apiKey: key });
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" accessibilityLabel={t('link_platform.steam.title')}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
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

        <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
          {t('link_platform.steam.title')}
        </Text>

        <Text className="text-gray-400 text-sm mb-6">
          {t('link_platform.steam.description')}
        </Text>

        <View
          className="bg-gray-800 rounded-xl p-4 mb-6"
          accessible
          accessibilityLabel={[
            t('link_platform.steam.step1'),
            t('link_platform.steam.step2'),
            t('link_platform.steam.step3'),
          ].join(' ')}
        >
          <Text className="text-gray-300 text-sm mb-2">{t('link_platform.steam.step1')}</Text>
          <Text className="text-gray-300 text-sm mb-2">{t('link_platform.steam.step2')}</Text>
          <Text className="text-gray-300 text-sm">{t('link_platform.steam.step3')}</Text>
        </View>

        {/* SteamID64 */}
        <Text className="text-gray-300 text-sm mb-2" accessibilityRole="none">
          {t('link_platform.steam.steam_id_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.steam.steam_id_placeholder')}
          placeholderTextColor="#6b7280"
          value={steamId}
          onChangeText={(v) => { setSteamId(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.steam.steam_id_label')}
          accessibilityHint={t('link_platform.steam.steam_id_hint')}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!linkMutation.isPending}
        />

        {/* API Key */}
        <Text className="text-gray-300 text-sm mb-2" accessibilityRole="none">
          {t('link_platform.steam.api_key_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-1 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.steam.api_key_placeholder')}
          placeholderTextColor="#6b7280"
          value={apiKey}
          onChangeText={(v) => { setApiKey(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.steam.api_key_label')}
          accessibilityHint={t('link_platform.steam.api_key_hint')}
          autoCapitalize="none"
          autoCorrect={false}
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

        <View
          className="bg-gray-900 border border-gray-700 rounded-xl p-3 mb-6"
          accessible
          accessibilityLabel={t('link_platform.steam.privacy_note')}
        >
          <Text className="text-gray-500 text-xs">{t('link_platform.steam.privacy_note')}</Text>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={linkMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('link_platform.steam.submit_label')}
          accessibilityState={{ disabled: linkMutation.isPending, busy: linkMutation.isPending }}
          className={`rounded-xl py-4 items-center ${
            linkMutation.isPending ? 'bg-blue-800' : 'bg-blue-600'
          }`}
          style={{ minHeight: 44 }}
        >
          {linkMutation.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white font-semibold ml-2" accessibilityLiveRegion="polite">
                {t('link_platform.steam.loading')}
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('link_platform.steam.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
