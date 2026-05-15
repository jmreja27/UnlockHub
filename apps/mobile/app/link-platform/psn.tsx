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

const PSN_LOGIN_URL = 'https://my.playstation.com/';
const PSN_COOKIE_URL = 'https://ca.account.sony.com/api/v1/ssocookie';

function StepRow({ number, text, url, urlLabel }: {
  number: number;
  text: string;
  url?: string;
  urlLabel?: string;
}) {
  return (
    <View className="flex-row mb-4" accessible accessibilityLabel={`Paso ${number}: ${text}`}>
      <View
        className="w-7 h-7 rounded-full bg-blue-600 items-center justify-center mr-3 mt-0.5"
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

export default function LinkPsnScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [npsso, setNpsso] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(true);

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
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="mb-6 self-start"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-blue-400 text-base">{t('common.back')}</Text>
        </Pressable>

        {/* Plataforma badge */}
        <View className="flex-row items-center mb-3">
          <View className="bg-[#003791] rounded-lg px-3 py-1 mr-2">
            <Text className="text-white text-xs font-bold">PlayStation</Text>
          </View>
        </View>

        <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
          {t('link_platform.psn.title')}
        </Text>
        <Text className="text-gray-400 text-sm mb-5">
          {t('link_platform.psn.description')}
        </Text>

        {/* Guía paso a paso expandible */}
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
            <StepRow
              number={1}
              text={t('link_platform.psn.guide_step1')}
              url={PSN_LOGIN_URL}
              urlLabel="my.playstation.com"
            />
            <StepRow
              number={2}
              text={t('link_platform.psn.guide_step2')}
            />
            <StepRow
              number={3}
              text={t('link_platform.psn.guide_step3')}
              url={PSN_COOKIE_URL}
              urlLabel="ca.account.sony.com/api/v1/ssocookie"
            />
            <StepRow
              number={4}
              text={t('link_platform.psn.guide_step4')}
            />
            <View className="bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2 mt-1 mb-2">
              <Text className="text-amber-300 text-xs">{t('link_platform.psn.guide_tip')}</Text>
            </View>
          </View>
        )}

        {/* Campo NPSSO */}
        <Text className="text-gray-300 text-sm mb-2">
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
          accessibilityLabel={t('link_platform.psn.privacy_note')}
        >
          <Text className="text-gray-500 text-xs">{t('link_platform.psn.privacy_note')}</Text>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={linkMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('link_platform.psn.submit_label')}
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
