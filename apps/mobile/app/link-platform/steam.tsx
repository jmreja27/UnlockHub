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

import { api, ApiRequestError } from '../../lib/api';
import type { PlatformAccount } from '@unlockhub/types';

const STEAMID_LOOKUP_URL = 'https://www.steamid.io/';
const STEAM_API_KEY_URL = 'https://store.steampowered.com/dev/apikey';
const STEAM_PRIVACY_URL = 'https://store.steampowered.com/account/';

function StepRow({ number, text, url, urlLabel }: {
  number: number;
  text: string;
  url?: string;
  urlLabel?: string;
}) {
  return (
    <View className="flex-row mb-4" accessible accessibilityLabel={`Paso ${number}: ${text}`}>
      <View
        className="w-7 h-7 rounded-full bg-[#1b9fff] items-center justify-center mr-3 mt-0.5"
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
            <Text className="text-blue-400 text-xs mt-1 underline">{urlLabel} →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function LinkSteamScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [steamId, setSteamId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(true);

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
            <Ionicons name="help-circle-outline" size={18} color="#60a5fa" style={{ marginRight: 8 }} accessibilityElementsHidden />
            <Text className="text-blue-300 text-sm font-semibold">{t('link_platform.guide_title')}</Text>
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
            {/* SteamID64 */}
            <Text className="text-gray-400 text-xs uppercase tracking-wider mb-3 font-semibold">
              {t('link_platform.steam.guide_section_id')}
            </Text>
            <StepRow
              number={1}
              text={t('link_platform.steam.guide_step1')}
              url={STEAMID_LOOKUP_URL}
              urlLabel="steamid.io"
            />
            <StepRow
              number={2}
              text={t('link_platform.steam.guide_step2')}
            />
            <StepRow
              number={3}
              text={t('link_platform.steam.guide_step3')}
            />

            {/* API Key */}
            <Text className="text-gray-400 text-xs uppercase tracking-wider mb-3 mt-2 font-semibold">
              {t('link_platform.steam.guide_section_key')}
            </Text>
            <StepRow
              number={4}
              text={t('link_platform.steam.guide_step4')}
              url={STEAM_API_KEY_URL}
              urlLabel="store.steampowered.com/dev/apikey"
            />
            <StepRow
              number={5}
              text={t('link_platform.steam.guide_step5')}
            />

            {/* Perfil público */}
            <View className="bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2 mt-1 mb-2">
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

        {/* SteamID64 */}
        <Text className="text-gray-300 text-sm mb-2">
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
        <Text className="text-gray-300 text-sm mb-2">
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
