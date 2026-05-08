// Pantalla de política de privacidad — requerida por Google Play y RGPD
import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

// URL de la política completa — actualizar cuando esté publicada
const PRIVACY_POLICY_URL = 'https://unlockhub.app/privacy';

export default function PrivacyScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera con botón de retroceso */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-800">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
        >
          <Text className="text-primary-light text-base">{t('common.back')}</Text>
        </Pressable>
        <Text className="text-white text-lg font-bold ml-2" accessibilityRole="header">
          {t('privacy.title')}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Introducción */}
        <Text className="text-gray-300 text-sm leading-6 mb-4">
          {t('privacy.intro')}
        </Text>

        {/* Sección: datos recopilados */}
        <Text className="text-white font-semibold text-base mb-2">
          {t('privacy.data_collected_title')}
        </Text>
        <Text className="text-gray-300 text-sm leading-6 mb-4">
          {t('privacy.data_collected_body')}
        </Text>

        {/* Sección: publicidad y AdMob */}
        <Text className="text-white font-semibold text-base mb-2">
          {t('privacy.ads_title')}
        </Text>
        <Text className="text-gray-300 text-sm leading-6 mb-4">
          {t('privacy.ads_body')}
        </Text>

        {/* Sección: contacto y derechos RGPD */}
        <Text className="text-white font-semibold text-base mb-2">
          {t('privacy.contact_title')}
        </Text>
        <Text className="text-gray-300 text-sm leading-6 mb-6">
          {t('privacy.contact_body')}
        </Text>

        {/* Enlace a la política completa en el navegador */}
        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel={t('privacy.full_policy_label')}
          className="bg-surface-elevated rounded-xl px-4 py-4 items-center active:opacity-80"
          style={{ minHeight: 52 }}
        >
          <Text className="text-primary-light font-semibold text-base">
            {t('privacy.full_policy_cta')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
