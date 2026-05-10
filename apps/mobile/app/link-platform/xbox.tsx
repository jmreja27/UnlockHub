import { useEffect, useState } from 'react';
import {
  View,
  Text,
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
import * as WebBrowser from 'expo-web-browser';
import {
  useAuthRequest,
  makeRedirectUri,
  ResponseType,
} from 'expo-auth-session';

import { api, ApiRequestError } from '../../lib/api';
import type { PlatformAccount } from '@unlockhub/types';

// Requerido para completar el flujo OAuth2 en mobile correctamente
WebBrowser.maybeCompleteAuthSession();

const MS_DISCOVERY = {
  authorizationEndpoint:
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
};

const XBOX_CLIENT_ID = process.env['EXPO_PUBLIC_XBOX_CLIENT_ID'] ?? '';

export default function LinkXboxScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [linkError, setLinkError] = useState<string | null>(null);

  const redirectUri = makeRedirectUri({ scheme: 'unlockhub', path: 'link-platform/xbox' });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: XBOX_CLIENT_ID,
      scopes: ['XboxLive.signin', 'XboxLive.offline_access'],
      responseType: ResponseType.Code,
      redirectUri,
      usePKCE: true,
    },
    MS_DISCOVERY,
  );

  const linkMutation = useMutation({
    mutationFn: (params: { code: string; codeVerifier: string; redirectUri: string }) =>
      api.post<PlatformAccount>('/api/v1/platforms/xbox/link', params),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });
      Alert.alert(t('link_platform.xbox.success'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiRequestError && err.statusCode === 400) {
        setLinkError(t('link_platform.xbox.error_failed'));
        return;
      }
      setLinkError(t('common.error_generic'));
    },
  });

  // Procesar la respuesta del flujo OAuth2 cuando regresa del navegador
  useEffect(() => {
    if (!response) return;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      setLinkError(t('link_platform.xbox.error_cancelled'));
      return;
    }

    if (response.type === 'error') {
      setLinkError(t('link_platform.xbox.error_failed'));
      return;
    }

    if (response.type === 'success') {
      const { code } = response.params;
      const codeVerifier = request?.codeVerifier;

      if (!code || !codeVerifier) {
        setLinkError(t('link_platform.xbox.error_failed'));
        return;
      }

      setLinkError(null);
      linkMutation.mutate({ code, codeVerifier, redirectUri });
    }
  }, [response]);

  function handleConnect() {
    setLinkError(null);
    void promptAsync();
  }

  const isBusy = linkMutation.isPending || !request;

  return (
    <SafeAreaView
      className="flex-1 bg-gray-950"
      accessibilityLabel={t('link_platform.xbox.title')}
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
          className="mb-6 self-start"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-blue-400 text-base">{t('common.back')}</Text>
        </Pressable>

        <Text
          className="text-white text-2xl font-bold mb-2"
          accessibilityRole="header"
        >
          {t('link_platform.xbox.title')}
        </Text>

        <Text className="text-gray-400 text-sm mb-6">
          {t('link_platform.xbox.description')}
        </Text>

        {/* Banner próximamente — Xbox es Fase 4 */}
        <View
          className="bg-yellow-900/40 border border-yellow-600/50 rounded-xl p-4 mb-6"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t('link_platform.xbox.coming_soon_title')}: ${t('link_platform.xbox.coming_soon_body')}`}
        >
          <Text className="text-yellow-400 font-semibold text-sm mb-1">
            {t('link_platform.xbox.coming_soon_title')}
          </Text>
          <Text className="text-yellow-200/80 text-xs leading-5">
            {t('link_platform.xbox.coming_soon_body')}
          </Text>
        </View>

        {/* Nota de privacidad */}
        <View
          className="bg-gray-900 border border-gray-700 rounded-xl p-3 mb-8"
          accessible={true}
          accessibilityLabel={t('link_platform.xbox.privacy_note')}
        >
          <Text className="text-gray-500 text-xs">{t('link_platform.xbox.privacy_note')}</Text>
        </View>

        {/* Error */}
        {linkError ? (
          <Text
            className="text-red-400 text-sm mb-4 text-center"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {linkError}
          </Text>
        ) : null}

        {/* Botón de autenticación Microsoft — desactivado hasta Fase 4 */}
        <Pressable
          onPress={handleConnect}
          disabled={true}
          accessibilityRole="button"
          accessibilityLabel={t('link_platform.xbox.submit_label')}
          accessibilityState={{ disabled: true }}
          className="rounded-xl py-4 items-center bg-green-900/50"
          style={{ minHeight: 44 }}
        >
          <Text className="text-green-600/70 font-semibold text-base">
            {t('link_platform.xbox.submit')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
