import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 px-6">
        <Pressable
          onPress={() => router.back()}
          className="mt-4 mb-8 self-start"
          accessibilityRole="button"
          accessibilityLabel="Volver atrás"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text className="text-primary-light text-base">← Volver</Text>
        </Pressable>

        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          Juego {id}
        </Text>
        <Text className="text-gray-400 mt-2">Los logros de este juego aparecerán aquí</Text>
      </View>
    </SafeAreaView>
  );
}
