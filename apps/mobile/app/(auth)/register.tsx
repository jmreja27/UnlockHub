// Pantalla de registro con formulario completo, validación por campo y verificación de edad mínima GDPR
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
  Linking,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../hooks/useAuth';
import { formatBirthDate } from '../../lib/formatTimeAgo';

const MIN_AGE = 16;

const TERMS_URL = 'https://jmreja27.github.io/UnlockHub/terms-of-service.html';
const PRIVACY_URL = 'https://jmreja27.github.io/UnlockHub/privacy-policy.html';

type FieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  birthDate?: string;
};

function isOldEnough(date: Date): boolean {
  const today = new Date();
  const cutoff = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  return date <= cutoff;
}

// Formatea Date → "YYYY-MM-DD" para la API. Sin Intl.
function formatForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { register, isRegistering, registerError } = useAuth();

  // Fecha máxima permitida: hoy - MIN_AGE años
  const today = new Date();
  const maxDate = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());

  function validateFields(): boolean {
    const errors: FieldErrors = {};

    if (!username.trim()) {
      errors.username = t('auth.register.error_username_required');
    } else if (username.trim().length < 3) {
      errors.username = t('auth.register.error_username_min');
    } else if (username.trim().length > 30) {
      errors.username = t('auth.register.error_username_max');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      errors.username = t('auth.register.error_username_format');
    }

    if (!email.trim()) {
      errors.email = t('auth.register.error_email_required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('auth.register.error_email_invalid');
    }

    if (!password) {
      errors.password = t('auth.register.error_password_required');
    } else if (password.length < 8) {
      errors.password = t('auth.register.error_password_min');
    } else if (!/[A-Z]/.test(password)) {
      errors.password = t('auth.register.error_password_uppercase');
    } else if (!/[0-9]/.test(password)) {
      errors.password = t('auth.register.error_password_number');
    }

    if (!birthDate) {
      errors.birthDate = t('auth.register.error_birthdate_required');
    } else if (!isOldEnough(birthDate)) {
      errors.birthDate = t('auth.register.error_birthdate_underage', { age: MIN_AGE });
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!validateFields()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    register({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      birthDate: formatForApi(birthDate!),
    });
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setShowPicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setBirthDate(selectedDate);
      if (fieldErrors.birthDate) {
        setFieldErrors((prev: FieldErrors) => ({ ...prev, birthDate: undefined }));
      }
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-6 pb-12">
            {/* Botón volver */}
            <Pressable
              onPress={() => router.back()}
              className="mb-8 self-start"
              accessibilityRole="button"
              accessibilityLabel={t('auth.register.back_label')}
              accessibilityHint={t('auth.register.back_hint')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text className="text-primary-light text-base">{t('common.back')}</Text>
            </Pressable>

            <Text
              className="text-3xl font-bold text-white mb-8"
              accessibilityRole="header"
            >
              {t('auth.register.title')}
            </Text>

            {/* Error global del servidor */}
            {registerError && (
              <View
                className="w-full bg-red-900/40 border border-red-500/60 rounded-xl px-4 py-3 mb-6"
                accessible
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                <Text className="text-red-400 text-sm">{registerError}</Text>
              </View>
            )}

            {/* Campo nombre de usuario */}
            <View className="mb-4">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">{t('auth.register.username_label')}</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.username ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder={t('auth.register.username_placeholder')}
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                value={username}
                onChangeText={(text: string) => {
                  setUsername(text);
                  if (fieldErrors.username) {
                    setFieldErrors((prev: FieldErrors) => ({ ...prev, username: undefined }));
                  }
                }}
                accessibilityLabel={t('auth.register.username_label')}
                accessibilityHint={t('auth.register.username_hint')}
              />
              {fieldErrors.username && (
                <Text
                  className="text-red-400 text-xs mt-1 ml-1"
                  accessibilityLiveRegion="polite"
                >
                  {fieldErrors.username}
                </Text>
              )}
            </View>

            {/* Campo email */}
            <View className="mb-4">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">{t('auth.register.email_label')}</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.email ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder={t('auth.register.email_placeholder')}
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                value={email}
                onChangeText={(text: string) => {
                  setEmail(text);
                  if (fieldErrors.email) {
                    setFieldErrors((prev: FieldErrors) => ({ ...prev, email: undefined }));
                  }
                }}
                accessibilityLabel={t('auth.register.email_label')}
                accessibilityHint={t('auth.register.email_hint')}
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
            <View className="mb-4">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">{t('auth.register.password_label')}</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.password ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder={t('auth.register.password_placeholder')}
                placeholderTextColor="#6b7280"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="next"
                value={password}
                onChangeText={(text: string) => {
                  setPassword(text);
                  if (fieldErrors.password) {
                    setFieldErrors((prev: FieldErrors) => ({ ...prev, password: undefined }));
                  }
                }}
                accessibilityLabel={t('auth.register.password_label')}
                accessibilityHint={t('auth.register.password_hint')}
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

            {/* Campo fecha de nacimiento — date picker nativo, requerido por GDPR España (≥16 años) */}
            <View className="mb-8">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">
                {t('auth.register.birthdate_label')}
              </Text>

              {/* Botón que abre el picker */}
              <Pressable
                className={`w-full bg-surface-elevated rounded-xl px-4 flex-row items-center justify-between border ${
                  fieldErrors.birthDate ? 'border-red-500' : 'border-surface-card'
                }`}
                onPress={() => setShowPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('auth.register.birthdate_label')}
                accessibilityHint={t('auth.register.birthdate_hint')}
                style={{ minHeight: 52 }}
              >
                <Text className={birthDate ? 'text-white text-base' : 'text-gray-500 text-base'}>
                  {birthDate ? formatBirthDate(birthDate) : t('auth.register.birthdate_placeholder')}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#6b7280" />
              </Pressable>

              {/* DateTimePicker — modal en Android, spinner inline en iOS */}
              {showPicker && (
                <DateTimePicker
                  value={birthDate ?? maxDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={maxDate}
                  minimumDate={new Date(1900, 0, 1)}
                  onChange={handleDateChange}
                />
              )}

              {/* Botón "Confirmar" en iOS para cerrar el spinner inline */}
              {Platform.OS === 'ios' && showPicker && (
                <Pressable
                  onPress={() => setShowPicker(false)}
                  className="self-end mt-1 px-2 py-1"
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.register.birthdate_confirm')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="text-primary-light font-medium text-sm">
                    {t('auth.register.birthdate_confirm')}
                  </Text>
                </Pressable>
              )}

              <Text className="text-gray-500 text-xs mt-1 ml-1">
                {t('auth.register.birthdate_gdpr_note', { age: MIN_AGE })}
              </Text>
              {fieldErrors.birthDate && (
                <Text
                  className="text-red-400 text-xs mt-1 ml-1"
                  accessibilityLiveRegion="polite"
                >
                  {fieldErrors.birthDate}
                </Text>
              )}
            </View>

            {/* Texto legal — ToS y Privacy Policy */}
            <View className="mb-6" accessible accessibilityLabel={t('auth.register.legal_accessibility')}>
              <Text className="text-gray-500 text-xs text-center leading-5">
                {t('auth.register.legal_prefix')}{' '}
                <Text
                  className="text-primary-light underline"
                  onPress={() => void Linking.openURL(TERMS_URL)}
                  accessibilityRole="link"
                  accessibilityLabel={t('auth.register.terms_label')}
                >
                  {t('auth.register.terms_label')}
                </Text>
                {' '}{t('auth.register.legal_connector')}{' '}
                <Text
                  className="text-primary-light underline"
                  onPress={() => void Linking.openURL(PRIVACY_URL)}
                  accessibilityRole="link"
                  accessibilityLabel={t('auth.register.privacy_label')}
                >
                  {t('auth.register.privacy_label')}
                </Text>
                {'.'}
              </Text>
            </View>

            {/* Botón de registro */}
            <Pressable
              className="w-full bg-primary rounded-xl py-4 items-center justify-center active:opacity-80"
              onPress={handleSubmit}
              disabled={isRegistering}
              accessibilityRole="button"
              accessibilityLabel={t('auth.register.submit')}
              accessibilityHint={t('auth.register.submit_hint')}
              accessibilityState={{ disabled: isRegistering, busy: isRegistering }}
              style={{ minHeight: 52 }}
            >
              {isRegistering ? (
                <ActivityIndicator
                  color="#ffffff"
                  accessibilityLabel={t('auth.register.loading_label')}
                />
              ) : (
                <Text className="text-white font-semibold text-base">{t('auth.register.submit')}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
