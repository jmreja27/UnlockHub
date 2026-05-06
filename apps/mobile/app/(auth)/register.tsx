// Pantalla de registro con formulario completo y validación por campo
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
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../hooks/useAuth';

type FieldErrors = {
  username?: string;
  email?: string;
  password?: string;
};

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { register, isRegistering, registerError } = useAuth();

  // Validación de campos en cliente antes de llamar a la API
  function validateFields(): boolean {
    const errors: FieldErrors = {};

    if (!username.trim()) {
      errors.username = 'El nombre de usuario es obligatorio.';
    } else if (username.trim().length < 3) {
      errors.username = 'El nombre de usuario debe tener al menos 3 caracteres.';
    } else if (username.trim().length > 30) {
      errors.username = 'El nombre de usuario no puede superar los 30 caracteres.';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      errors.username = 'Solo se permiten letras, números, _ y -.';
    }

    if (!email.trim()) {
      errors.email = 'El email es obligatorio.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Introduce un email válido.';
    }

    if (!password) {
      errors.password = 'La contraseña es obligatoria.';
    } else if (password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres.';
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'La contraseña debe contener al menos una mayúscula.';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'La contraseña debe contener al menos un número.';
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
    });
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
              accessibilityLabel="Volver atrás"
              accessibilityHint="Navega a la pantalla anterior"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text className="text-primary-light text-base">← Volver</Text>
            </Pressable>

            <Text
              className="text-3xl font-bold text-white mb-8"
              accessibilityRole="header"
            >
              Crear cuenta
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
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">Nombre de usuario</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.username ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder="gamer_pro_99"
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
                accessibilityLabel="Nombre de usuario"
                accessibilityHint="Introduce un nombre de usuario único. Solo letras, números, guiones y guiones bajos."
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
                  if (fieldErrors.email) {
                    setFieldErrors((prev: FieldErrors) => ({ ...prev, email: undefined }));
                  }
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
            <View className="mb-8">
              <Text className="text-gray-300 text-sm mb-1.5 ml-1">Contraseña</Text>
              <TextInput
                className={`w-full bg-surface-elevated rounded-xl px-4 py-3.5 text-white text-base border ${
                  fieldErrors.password ? 'border-red-500' : 'border-surface-card'
                }`}
                placeholder="Mínimo 8 caracteres, una mayúscula y un número"
                placeholderTextColor="#6b7280"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="done"
                value={password}
                onChangeText={(text: string) => {
                  setPassword(text);
                  if (fieldErrors.password) {
                    setFieldErrors((prev: FieldErrors) => ({ ...prev, password: undefined }));
                  }
                }}
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Contraseña"
                accessibilityHint="Mínimo 8 caracteres, al menos una mayúscula y un número"
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

            {/* Botón de registro */}
            <Pressable
              className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
              onPress={handleSubmit}
              disabled={isRegistering}
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta"
              accessibilityHint="Envía el formulario para crear tu cuenta en UnlockHub"
              accessibilityState={{ disabled: isRegistering, busy: isRegistering }}
              style={{ minHeight: 52 }}
            >
              {isRegistering ? (
                <ActivityIndicator
                  color="#ffffff"
                  accessibilityLabel="Creando tu cuenta, por favor espera"
                />
              ) : (
                <Text className="text-white font-semibold text-base">Crear cuenta</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
