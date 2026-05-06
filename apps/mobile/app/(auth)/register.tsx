import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function RegisterScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 px-6 pt-12">
        <Pressable
          onPress={() => router.back()}
          className="mb-8 self-start"
          accessibilityRole="button"
          accessibilityLabel="Volver atrás"
          accessibilityHint="Navega a la pantalla anterior"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text className="text-primary-light text-base">← Volver</Text>
        </Pressable>

        <Text className="text-3xl font-bold text-white mb-8" accessibilityRole="header">
          Crear cuenta
        </Text>

        {/* Formulario de registro — se implementa en el paso de autenticación */}
        <Text className="text-gray-400 text-center mt-12">Próximamente</Text>
      </View>
    </SafeAreaView>
  );
}
