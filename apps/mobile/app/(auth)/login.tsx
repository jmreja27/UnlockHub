import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

export default function LoginScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-4xl font-bold text-white mb-2" accessibilityRole="header">
          UnlockHub
        </Text>
        <Text className="text-primary-light text-base mb-12">Tu hub de logros</Text>

        <Pressable
          className="w-full bg-primary rounded-xl py-4 items-center mb-4 active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel="Iniciar sesión"
          accessibilityHint="Navega a la pantalla de inicio de sesión"
          onPress={() => {
            // TODO: implementar en el paso de autenticación
          }}
        >
          <Text className="text-white font-semibold text-base">Iniciar sesión</Text>
        </Pressable>

        <Link href="/(auth)/register" asChild>
          <Pressable
            className="w-full border border-primary rounded-xl py-4 items-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Crear cuenta nueva"
          >
            <Text className="text-primary-light font-semibold text-base">Crear cuenta</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
