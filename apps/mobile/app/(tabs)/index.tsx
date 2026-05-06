import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          {t('home.title')}
        </Text>
        <Text className="text-gray-400 mt-2 text-center">
          {t('home.empty')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
