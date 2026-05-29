// Pantalla de inicio de sesión con formulario completo y gestión de errores
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoggingIn, loginError } = useAuth();
  const { currentLanguage, changeLanguage } = useLanguage();

  // Validación básica en cliente antes de enviar
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function validateFields(): boolean {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = t('auth.login.error_email_required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('auth.login.error_email_invalid');
    }

    if (!password) {
      errors.password = t('auth.login.error_password_required');
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    // Feedback háptico al pulsar el botón de envío
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!validateFields()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    login({ email: email.trim().toLowerCase(), password });
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Toggle de idioma — disponible antes de autenticarse */}
      <View className="flex-row justify-end px-4 pt-2">
        <Pressable
          onPress={() => changeLanguage(currentLanguage === 'es' ? 'en' : 'es')}
          accessibilityRole="button"
          accessibilityLabel={t('auth.login.language_toggle')}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}
          testID="language-toggle"
        >
          <View className="flex-row items-center gap-1">
            <Text
              className={`text-xs font-semibold ${currentLanguage === 'es' ? 'text-primary-light' : 'text-gray-500'}`}
            >
              ES
            </Text>
            <Text className="text-gray-600 text-xs">|</Text>
            <Text
              className={`text-xs font-semibold ${currentLanguage === 'en' ? 'text-primary-light' : 'text-gray-500'}`}
            >
              EN
            </Text>
          </View>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 items-center justify-center px-6 py-12">
            {/* Cabecera */}
            <Text
              className="text-4xl font-bold text-white mb-2"
              accessibilityRole="header"
            >
              {t('auth.login.title')}
            </Text>
            <Text className="text-primary-light text-base mb-12">
              {t('auth.login.subtitle')}
            </Text>

            {/* Error global del servidor */}
            {loginError && (
              <View
                className="w-full bg-red-900/40 border border-red-500/60 rounded-xl px-4 py-3 mb-6"
                accessible
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                <Text className="text-red-400 text-sm">{loginError}</Text>
              </View>
            )}

            {/* Campo email */}
            <View className="w-full mb-4">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">{t('auth.login.email_label')}</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.email ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder={t('auth.login.email_placeholder')}
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                value={email}
                onChangeText={(text: string) => {
                  setEmail(text);
                  if (fieldErrors.email) setFieldErrors((prev: { email?: string; password?: string }) => ({ ...prev, email: undefined }));
                }}
                testID="login-email"
                accessibilityLabel={t('auth.login.email_label')}
                accessibilityHint={t('auth.login.email_hint')}
              />
              {fieldErrors.email && (
                <Text
                  className="text-red-400 text-xs mt-1 ml-1"
                  accessibilityLiveRegion="polite"
                >
                  {fieldErrors.email}
                </Text>
              )}
            </View>

            {/* Campo contraseña */}
            <View className="w-full mb-8">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">{t('auth.login.password_label')}</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.password ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder="••••••••"
                placeholderTextColor="#6b7280"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                returnKeyType="done"
                value={password}
                onChangeText={(text: string) => {
                  setPassword(text);
                  if (fieldErrors.password) setFieldErrors((prev: { email?: string; password?: string }) => ({ ...prev, password: undefined }));
                }}
                onSubmitEditing={handleSubmit}
                testID="login-password"
                accessibilityLabel={t('auth.login.password_label')}
                accessibilityHint={t('auth.login.password_hint')}
              />
              {fieldErrors.password && (
                <Text
                  className="text-red-400 text-xs mt-1 ml-1"
                  accessibilityLiveRegion="polite"
                >
                  {fieldErrors.password}
                </Text>
              )}
            </View>

            {/* Botón de inicio de sesión */}
            <Pressable
              className="w-full bg-primary rounded-xl py-4 items-center justify-center mb-4 active:opacity-80"
              onPress={handleSubmit}
              disabled={isLoggingIn}
              accessibilityRole="button"
              accessibilityLabel={t('auth.login.submit')}
              accessibilityHint={t('auth.login.submit_hint')}
              accessibilityState={{ disabled: isLoggingIn, busy: isLoggingIn }}
              style={{ minHeight: 52 }}
            >
              {isLoggingIn ? (
                <ActivityIndicator
                  color="#ffffff"
                  accessibilityLabel={t('auth.login.loading_label')}
                />
              ) : (
                <Text className="text-white font-semibold text-base">{t('auth.login.submit')}</Text>
              )}
            </Pressable>

            {/* Enlace a recuperación de contraseña */}
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable
                className="w-full items-center py-2 mb-2"
                accessibilityRole="link"
                accessibilityLabel={t('auth.forgot_password.title')}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text className="text-gray-500 text-sm">
                  {t('auth.forgot_password.title')}
                </Text>
              </Pressable>
            </Link>

            {/* Enlace a registro */}
            <Link href="/(auth)/register" asChild>
              <Pressable
                className="w-full border border-primary rounded-xl py-4 items-center justify-center active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel={t('auth.login.create_account_label')}
                accessibilityHint={t('auth.login.create_account_hint')}
                style={{ minHeight: 52 }}
              >
                <Text className="text-primary-light font-semibold text-base">
                  {t('auth.login.create_account')}
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
