import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          Inicio
        </Text>
        <Text className="text-gray-400 mt-2 text-center">
          Tus logros recientes aparecerán aquí
        </Text>
      </View>
    </SafeAreaView>
  );
}
