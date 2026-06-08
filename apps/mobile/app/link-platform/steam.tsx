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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

import { api, ApiRequestError } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

const STEAM_PRIVACY_URL = 'https://store.steampowered.com/account/';

function GuideStep({ number, text }: { number: number; text: string }) {
  return (
    <View className="flex-row mb-3" accessible accessibilityLabel={`Paso ${number}: ${text}`}>
      <View
        className="w-7 h-7 rounded-full bg-[#1b9fff] items-center justify-center mr-3 mt-0.5"
        accessibilityElementsHidden
      >
        <Text className="text-white text-xs font-bold">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-gray-200 text-sm leading-5">{text}</Text>
      </View>
    </View>
  );
}

export default function LinkSteamScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(false);

  const linkMutation = useMutation({
    mutationFn: (data: { username: string }) =>
      api.post<PlatformAccount>('/api/v1/platforms/steam/link', data),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedPlatforms() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformsBase() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncSummaryBase() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
      Alert.alert(t('link_platform.steam.success'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 404) {
          setFieldError(t('link_platform.steam.error_not_found'));
          return;
        }
        if (err.statusCode === 400 && err.apiError.code === 'STEAM_PROFILE_PRIVATE') {
          setFieldError(t('link_platform.steam.error_profile_private'));
          return;
        }
        if (err.statusCode === 409) {
          setFieldError(t('link_platform.steam.error_already_linked'));
          return;
        }
        if (err.statusCode === 503) {
          setFieldError(t('link_platform.steam.error_service_unavailable'));
          return;
        }
      }
      setFieldError(t('common.error_generic'));
    },
  });

  function handleSubmit() {
    setFieldError(null);
    const value = username.trim();
    if (!value) {
      setFieldError(t('link_platform.steam.error_empty'));
      return;
    }
    linkMutation.mutate({ username: value });
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
          className="mb-6 self-start"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-blue-400 text-base">{t('common.back')}</Text>
        </Pressable>

        <View className="flex-row items-center mb-3">
          <View className="bg-[#1b2838] border border-[#1b9fff]/40 rounded-lg px-3 py-1 mr-2">
            <Text className="text-[#1b9fff] text-xs font-bold">Steam</Text>
          </View>
        </View>

        <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
          {t('link_platform.steam.title')}
        </Text>
        <Text className="text-gray-400 text-sm mb-5">
          {t('link_platform.steam.description')}
        </Text>

        {/* Campo de username */}
        <Text className="text-gray-300 text-sm mb-2">
          {t('link_platform.steam.username_label')}
        </Text>
        <TextInput
          testID="steam-username-input"
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-1 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.steam.username_placeholder')}
          placeholderTextColor="#6b7280"
          value={username}
          onChangeText={(v) => { setUsername(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.steam.username_label')}
          accessibilityHint={t('link_platform.steam.username_hint')}
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

        {/* Guía expandible */}
        <Pressable
          onPress={() => setGuideExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={guideExpanded ? t('link_platform.guide_collapse') : t('link_platform.guide_expand')}
          accessibilityState={{ expanded: guideExpanded }}
          className="flex-row items-center justify-between bg-gray-800 rounded-t-xl px-4 py-3 mb-0"
          style={{
            minHeight: 44,
            borderBottomLeftRadius: guideExpanded ? 0 : 12,
            borderBottomRightRadius: guideExpanded ? 0 : 12,
          }}
        >
          <View className="flex-row items-center">
            <Ionicons name="help-circle-outline" size={18} color="#60a5fa" style={{ marginRight: 8 }} accessibilityElementsHidden />
            <Text className="text-blue-300 text-sm font-semibold">{t('link_platform.steam.guide_title')}</Text>
          </View>
          <Ionicons
            name={guideExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#9ca3af"
            accessibilityElementsHidden
          />
        </Pressable>

        {guideExpanded && (
          <View className="bg-gray-800 rounded-b-xl px-4 pt-4 pb-3 mb-5">
            <GuideStep number={1} text={t('link_platform.steam.guide_step1')} />
            <GuideStep number={2} text={t('link_platform.steam.guide_step2')} />
            <GuideStep number={3} text={t('link_platform.steam.guide_step3')} />
            <View className="bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2 mt-1">
              <Text className="text-amber-300 text-xs">{t('link_platform.steam.guide_public_warning')}</Text>
              <Pressable
                onPress={() => void Linking.openURL(STEAM_PRIVACY_URL)}
                accessibilityRole="link"
                accessibilityLabel={t('link_platform.steam.guide_privacy_link')}
                style={{ minHeight: 32, justifyContent: 'center' }}
              >
                <Text className="text-amber-400 text-xs underline mt-1">
                  {t('link_platform.steam.guide_privacy_link')} →
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {!guideExpanded && <View className="mb-5" />}

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
          className={`rounded-xl py-4 items-center justify-center ${
            linkMutation.isPending ? 'bg-blue-800' : 'bg-blue-600'
          }`}
          style={{ minHeight: 52 }}
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
