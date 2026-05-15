import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

import { api, ApiRequestError } from '../../lib/api';

const RA_SETTINGS_URL = 'https://retroachievements.org/controlpanel.php';
const RA_REGISTER_URL = 'https://retroachievements.org/createaccount.php';

function StepRow({ number, text, url, urlLabel }: {
  number: number;
  text: string;
  url?: string;
  urlLabel?: string;
}) {
  return (
    <View className="flex-row mb-4" accessible accessibilityLabel={`Paso ${number}: ${text}`}>
      <View
        className="w-7 h-7 rounded-full bg-red-700 items-center justify-center mr-3 mt-0.5"
        accessibilityElementsHidden
      >
        <Text className="text-white text-xs font-bold">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-gray-200 text-sm leading-5">{text}</Text>
        {url && urlLabel && (
          <Pressable
            onPress={() => void Linking.openURL(url)}
            accessibilityRole="link"
            accessibilityLabel={urlLabel}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <Text className="text-red-400 text-xs mt-1 underline">{urlLabel} →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function LinkRAScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(true);

  const linkMutation = useMutation({
    mutationFn: (data: { username: string; apiKey: string }) =>
      api.post<PlatformAccount>('/api/v1/platforms/ra/link', data),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });
      void queryClient.invalidateQueries({ queryKey: ['platforms'] });
      Alert.alert(t('link_platform.ra.success'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 400) {
          setFieldError(t('link_platform.ra.error_invalid'));
          return;
        }
        if (err.statusCode === 409) {
          setFieldError(t('link_platform.ra.error_already_linked'));
          return;
        }
      }
      setFieldError(t('common.error_generic'));
    },
  });

  function handleSubmit() {
    setFieldError(null);
    const uname = username.trim();
    const key = apiKey.trim();

    if (!uname) {
      setFieldError(t('link_platform.ra.error_empty_username'));
      return;
    }
    if (!key) {
      setFieldError(t('link_platform.ra.error_empty_key'));
      return;
    }
    linkMutation.mutate({ username: uname, apiKey: key });
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" accessibilityLabel={t('link_platform.ra.title')}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="mb-6 self-start"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-blue-400 text-base">{t('common.back')}</Text>
        </Pressable>

        <View className="flex-row items-center mb-3">
          <View className="bg-[#c0392b]/80 rounded-lg px-3 py-1 mr-2">
            <Text className="text-white text-xs font-bold">RetroAchievements</Text>
          </View>
        </View>

        <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
          {t('link_platform.ra.title')}
        </Text>
        <Text className="text-gray-400 text-sm mb-5">
          {t('link_platform.ra.description')}
        </Text>

        {/* Guía expandible */}
        <Pressable
          onPress={() => setGuideExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={guideExpanded ? t('link_platform.guide_collapse') : t('link_platform.guide_expand')}
          accessibilityState={{ expanded: guideExpanded }}
          className="flex-row items-center justify-between bg-gray-800 rounded-t-xl px-4 py-3"
          style={{ minHeight: 44 }}
        >
          <View className="flex-row items-center">
            <Ionicons name="help-circle-outline" size={18} color="#f87171" style={{ marginRight: 8 }} accessibilityElementsHidden />
            <Text className="text-red-300 text-sm font-semibold">{t('link_platform.guide_title')}</Text>
          </View>
          <Ionicons
            name={guideExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#9ca3af"
            accessibilityElementsHidden
          />
        </Pressable>

        {guideExpanded && (
          <View className="bg-gray-800 rounded-b-xl px-4 pt-4 pb-2 mb-5">
            <StepRow
              number={1}
              text={t('link_platform.ra.guide_step1')}
              url={RA_REGISTER_URL}
              urlLabel="retroachievements.org"
            />
            <StepRow
              number={2}
              text={t('link_platform.ra.guide_step2')}
            />
            <StepRow
              number={3}
              text={t('link_platform.ra.guide_step3')}
              url={RA_SETTINGS_URL}
              urlLabel="retroachievements.org/controlpanel.php"
            />
            <StepRow
              number={4}
              text={t('link_platform.ra.guide_step4')}
            />
            <View className="bg-blue-900/30 border border-blue-600/40 rounded-lg px-3 py-2 mt-1 mb-2">
              <Text className="text-blue-300 text-xs">{t('link_platform.ra.guide_tip')}</Text>
            </View>
          </View>
        )}

        {/* Username */}
        <Text className="text-gray-300 text-sm mb-2">
          {t('link_platform.ra.username_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.ra.username_placeholder')}
          placeholderTextColor="#6b7280"
          value={username}
          onChangeText={(v) => { setUsername(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.ra.username_label')}
          accessibilityHint={t('link_platform.ra.username_hint')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!linkMutation.isPending}
        />

        {/* API Key */}
        <Text className="text-gray-300 text-sm mb-2">
          {t('link_platform.ra.api_key_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-1 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.ra.api_key_placeholder')}
          placeholderTextColor="#6b7280"
          value={apiKey}
          onChangeText={(v) => { setApiKey(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.ra.api_key_label')}
          accessibilityHint={t('link_platform.ra.api_key_hint')}
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
          accessibilityLabel={t('link_platform.ra.privacy_note')}
        >
          <Text className="text-gray-500 text-xs">{t('link_platform.ra.privacy_note')}</Text>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={linkMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('link_platform.ra.submit_label')}
          accessibilityState={{ disabled: linkMutation.isPending, busy: linkMutation.isPending }}
          className={`rounded-xl py-4 items-center ${
            linkMutation.isPending ? 'bg-red-800' : 'bg-red-600'
          }`}
          style={{ minHeight: 52 }}
        >
          {linkMutation.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white font-semibold ml-2" accessibilityLiveRegion="polite">
                {t('link_platform.ra.loading')}
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('link_platform.ra.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
