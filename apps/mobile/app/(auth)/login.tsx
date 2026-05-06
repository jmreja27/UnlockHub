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

import { useAuth } from '../../hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoggingIn, loginError } = useAuth();

  // Validación básica en cliente antes de enviar
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function validateFields(): boolean {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = 'El email es obligatorio.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Introduce un email válido.';
    }

    if (!password) {
      errors.password = 'La contraseña es obligatoria.';
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
              UnlockHub
            </Text>
            <Text className="text-primary-light text-base mb-12">
              Tu hub de logros
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
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">Email</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.email ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder="tu@email.com"
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
                accessibilityLabel="Email"
                accessibilityHint="Introduce tu dirección de correo electrónico"
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
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">Contraseña</Text>
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
                accessibilityLabel="Contraseña"
                accessibilityHint="Introduce tu contraseña"
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
              className="w-full bg-primary rounded-xl py-4 items-center mb-4 active:opacity-80"
              onPress={handleSubmit}
              disabled={isLoggingIn}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              accessibilityHint="Envía el formulario para iniciar sesión con tu cuenta"
              accessibilityState={{ disabled: isLoggingIn, busy: isLoggingIn }}
              style={{ minHeight: 52 }}
            >
              {isLoggingIn ? (
                <ActivityIndicator
                  color="#ffffff"
                  accessibilityLabel="Iniciando sesión, por favor espera"
                />
              ) : (
                <Text className="text-white font-semibold text-base">Iniciar sesión</Text>
              )}
            </Pressable>

            {/* Enlace a registro */}
            <Link href="/(auth)/register" asChild>
              <Pressable
                className="w-full border border-primary rounded-xl py-4 items-center active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel="Crear cuenta nueva"
                accessibilityHint="Navega a la pantalla de registro para crear una nueva cuenta"
                style={{ minHeight: 52 }}
              >
                <Text className="text-primary-light font-semibold text-base">
                  Crear cuenta
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
