import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

import { api, ApiRequestError } from '../../lib/api';

function PrivacyGuide() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="mb-5">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('link_platform.guide_collapse') : t('link_platform.guide_expand')}
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between bg-gray-800 rounded-t-xl px-4 py-3"
        style={{ minHeight: 44, borderBottomLeftRadius: expanded ? 0 : 12, borderBottomRightRadius: expanded ? 0 : 12 }}
      >
        <View className="flex-row items-center">
          <Ionicons name="help-circle-outline" size={18} color="#60a5fa" style={{ marginRight: 8 }} accessibilityElementsHidden />
          <Text className="text-blue-300 text-sm font-semibold">{t('link_platform.psn.guide_title')}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#9ca3af"
          accessibilityElementsHidden
        />
      </Pressable>

      {expanded && (
        <View className="bg-gray-800 rounded-b-xl px-4 pt-4 pb-3">
          {([1, 2, 3] as const).map((n) => (
            <View key={n} className="flex-row mb-3" accessible accessibilityLabel={t(`link_platform.psn.guide_step${n}`)}>
              <View
                className="w-6 h-6 rounded-full bg-blue-600 items-center justify-center mr-3 mt-0.5"
                accessibilityElementsHidden
              >
                <Text className="text-white text-xs font-bold">{n}</Text>
              </View>
              <Text className="text-gray-200 text-sm leading-5 flex-1">
                {t(`link_platform.psn.guide_step${n}`)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PrivateProfileSteps() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('link_platform.guide_collapse') : t('link_platform.psn.profile_private_cta')}
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between bg-yellow-900 rounded-t-xl px-4 py-3"
        style={{ minHeight: 44, borderBottomLeftRadius: expanded ? 0 : 12, borderBottomRightRadius: expanded ? 0 : 12 }}
        testID="psn-private-guide-toggle"
      >
        <View className="flex-row items-center">
          <Ionicons name="help-circle-outline" size={18} color="#fbbf24" style={{ marginRight: 8 }} accessibilityElementsHidden />
          <Text className="text-yellow-300 text-sm font-semibold">{t('link_platform.psn.profile_private_cta')}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#d97706"
          accessibilityElementsHidden
        />
      </Pressable>

      {expanded && (
        <View className="bg-yellow-900 rounded-b-xl px-4 pt-4 pb-3">
          {([1, 2, 3] as const).map((n) => (
            <View key={n} className="flex-row mb-3" accessible accessibilityLabel={t(`link_platform.psn.profile_private_step${n}`)}>
              <View
                className="w-6 h-6 rounded-full bg-yellow-600 items-center justify-center mr-3 mt-0.5"
                accessibilityElementsHidden
              >
                <Text className="text-white text-xs font-bold">{n}</Text>
              </View>
              <Text className="text-yellow-100 text-sm leading-5 flex-1">
                {t(`link_platform.psn.profile_private_step${n}`)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function LinkPsnScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [linkedPrivate, setLinkedPrivate] = useState(false);

  const linkMutation = useMutation({
    mutationFn: (psnUsername: string) =>
      api.post<PlatformAccount>('/api/v1/platforms/psn/link', { username: psnUsername }),
    onSuccess: (account) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });

      if (account.psnProfilePrivate) {
        // No navegar — mostrar el banner de perfil privado en la misma pantalla
        setLinkedPrivate(true);
      } else {
        // Perfil público: navegar de vuelta como antes
        void queryClient.invalidateQueries({ queryKey: ['my-games'] });
        router.back();
      }
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 404) {
          setFieldError(t('link_platform.psn.error_not_found'));
          return;
        }
        if (err.statusCode === 409) {
          setFieldError(t('link_platform.psn.error_already_linked'));
          return;
        }
        if (err.statusCode === 400) {
          setFieldError(t('link_platform.psn.error_invalid'));
          return;
        }
        if (err.statusCode === 503) {
          setFieldError(t('link_platform.psn.error_service_unavailable'));
          return;
        }
      }
      setFieldError(t('common.error_generic'));
    },
  });

  function handleSubmit() {
    setFieldError(null);
    const trimmed = username.trim();
    if (!trimmed) {
      setFieldError(t('link_platform.psn.error_empty'));
      return;
    }
    linkMutation.mutate(trimmed);
  }

  // ─── Vista de perfil privado tras vincular ────────────────────────────────────
  if (linkedPrivate) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24 }}
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

          {/* Confirmación de vinculación */}
          <View className="flex-row items-center mb-4">
            <View className="bg-[#003791] rounded-lg px-3 py-1 mr-2">
              <Text className="text-white text-xs font-bold">PlayStation</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" accessibilityElementsHidden />
            <Text className="text-green-400 text-sm ml-1">{t('link_platform.psn.success')}</Text>
          </View>

          {/* Banner ⚠️ perfil privado */}
          <View
            className="bg-yellow-900 border border-yellow-600 rounded-xl p-4 mb-5"
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`${t('link_platform.psn.profile_private_title')}: ${t('link_platform.psn.profile_private_body')}`}
            testID="psn-private-banner"
          >
            <View className="flex-row items-center mb-2">
              <Ionicons name="warning" size={20} color="#fbbf24" accessibilityElementsHidden />
              <Text className="text-yellow-300 text-base font-bold ml-2">
                {t('link_platform.psn.profile_private_title')}
              </Text>
            </View>
            <Text className="text-yellow-100 text-sm leading-5">
              {t('link_platform.psn.profile_private_body')}
            </Text>
          </View>

          {/* Pasos para hacer el perfil público */}
          <PrivateProfileSteps />

          {/* CTA para ir a la biblioteca */}
          <Pressable
            onPress={() => router.replace('/(tabs)/')}
            accessibilityRole="button"
            accessibilityLabel={t('link_platform.psn.profile_private_go_library')}
            className="rounded-xl py-4 items-center bg-blue-600 mt-2"
            style={{ minHeight: 52 }}
            testID="psn-private-go-library"
          >
            <Text className="text-white font-semibold text-base">
              {t('link_platform.psn.profile_private_go_library')}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Vista normal de vinculación ─────────────────────────────────────────────
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
        <Text className="text-gray-400 text-sm mb-6">
          {t('link_platform.psn.description')}
        </Text>

        {/* Guía para hacer el perfil público */}
        <PrivacyGuide />

        {/* Campo de username */}
        <Text className="text-gray-300 text-sm mb-2">
          {t('link_platform.psn.username_label')}
        </Text>
        <TextInput
          className={`bg-gray-800 text-white rounded-xl px-4 py-3 mb-1 text-sm ${
            fieldError ? 'border border-red-500' : ''
          }`}
          placeholder={t('link_platform.psn.username_placeholder')}
          placeholderTextColor="#6b7280"
          value={username}
          onChangeText={(v) => { setUsername(v); setFieldError(null); }}
          accessibilityLabel={t('link_platform.psn.username_label')}
          accessibilityHint={t('link_platform.psn.username_hint')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!linkMutation.isPending}
          testID="psn-username-input"
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
          className="bg-gray-900 border border-gray-700 rounded-xl p-3 mb-6 flex-row items-start"
          accessible
          accessibilityLabel={t('link_platform.psn.privacy_note')}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#6b7280"
            style={{ marginRight: 8, marginTop: 1 }}
            accessibilityElementsHidden
          />
          <Text className="text-gray-500 text-xs flex-1">{t('link_platform.psn.privacy_note')}</Text>
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
