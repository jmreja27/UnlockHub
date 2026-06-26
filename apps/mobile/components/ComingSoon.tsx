import { View, Text, Pressable } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useSafeBack } from '../hooks/useSafeBack';

export function ComingSoon({ edges }: { edges?: Edge[] }) {
  const { t } = useTranslation();
  const safeBack = useSafeBack();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={edges}>
      <View className="flex-1 items-center justify-center px-8">
        <Ionicons name="rocket-outline" size={64} color="#818cf8" accessibilityElementsHidden />
        <Text
          className="text-white text-2xl font-bold text-center mt-6 mb-3"
          accessibilityRole="header"
        >
          {t('common.coming_soon_title')}
        </Text>
        <Text className="text-gray-400 text-base text-center leading-6">
          {t('common.coming_soon_body')}
        </Text>
        <Pressable
          onPress={safeBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="mt-8 bg-surface-elevated rounded-xl px-8 py-3 active:opacity-80"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-primary-light font-semibold text-base">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
