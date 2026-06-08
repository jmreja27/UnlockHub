import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';

import { usePreferencesStore } from '../stores/preferencesStore';
import { getPlatformColor } from '../lib/platformColors';

interface Step {
  titleKey: string;
  bodyKey: string;
  emoji: string;
  color: string;
}

const STEPS: Step[] = [
  { titleKey: 'onboarding.step1_title', bodyKey: 'onboarding.step1_body', emoji: '🏆', color: '#6366f1' },
  { titleKey: 'onboarding.step2_title', bodyKey: 'onboarding.step2_body', emoji: '🔗', color: '#10b981' },
  { titleKey: 'onboarding.step3_title', bodyKey: 'onboarding.step3_body', emoji: '🚀', color: '#f59e0b' },
  { titleKey: 'onboarding.step4_title', bodyKey: 'onboarding.step4_body', emoji: '🎮', color: '#8b5cf6' },
];

type PlatformRoute = '/link-platform/steam' | '/link-platform/psn' | '/link-platform/ra';

const PLATFORM_LINKS: Array<{ key: 'STEAM' | 'PSN' | 'RA'; labelKey: string; route: PlatformRoute }> = [
  { key: 'STEAM', labelKey: 'onboarding.platform_steam', route: '/link-platform/steam' },
  { key: 'PSN', labelKey: 'onboarding.platform_psn', route: '/link-platform/psn' },
  { key: 'RA', labelKey: 'onboarding.platform_ra', route: '/link-platform/ra' },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { completeOnboarding } = usePreferencesStore();
  const [currentStep, setCurrentStep] = useState(0);
  const isLast = currentStep === STEPS.length - 1;

  function finish() {
    completeOnboarding();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  }

  function next() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) {
      finish();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function skip() {
    finish();
  }

  function linkPlatform(route: PlatformRoute) {
    completeOnboarding();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace(route);
  }

  const step = STEPS[currentStep];

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 px-8 justify-between py-8">
        {/* Skip button */}
        <View className="items-end">
          {!isLast && (
            <Pressable
              onPress={skip}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.cta_skip')}
              style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}
            >
              <Text className="text-gray-500 text-sm">{t('onboarding.cta_skip')}</Text>
            </Pressable>
          )}
        </View>

        {/* Contenido del paso */}
        <View className="flex-1 items-center justify-center">
          {/* Emoji / ilustración — solo en pasos 1-3 */}
          {!isLast && (
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-10"
              style={{ backgroundColor: `${step?.color ?? '#6366f1'}20` }}
              accessibilityElementsHidden
            >
              <Text style={{ fontSize: 64 }}>{step?.emoji}</Text>
            </View>
          )}

          <Text
            className="text-white text-2xl font-bold text-center mb-4"
            accessibilityRole="header"
          >
            {t(step?.titleKey ?? '')}
          </Text>
          <Text className={`text-gray-400 text-base text-center leading-6 ${isLast ? 'mb-8' : ''}`}>
            {t(step?.bodyKey ?? '')}
          </Text>

          {/* Botones de plataforma — solo en paso 4 */}
          {isLast && (
            <View className="w-full gap-3">
              {PLATFORM_LINKS.map(({ key, labelKey, route }) => (
                <Pressable
                  key={key}
                  testID={`onboarding-link-${key.toLowerCase()}`}
                  onPress={() => { linkPlatform(route); }}
                  accessibilityRole="button"
                  accessibilityLabel={t(labelKey)}
                  style={{ minHeight: 52, borderLeftWidth: 3, borderLeftColor: getPlatformColor(key) }}
                  className="flex-row items-center bg-surface-elevated rounded-xl px-4 gap-3"
                >
                  <Text className="text-white font-semibold flex-1 text-base">{t(labelKey)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Indicadores de paso */}
        <View className="items-center mb-8">
          <View className="flex-row gap-2">
            {STEPS.map((_, i) => (
              <View
                key={i}
                className={`h-2 rounded-full ${
                  i === currentStep ? 'w-6 bg-primary' : 'w-2 bg-surface-card'
                }`}
                accessibilityElementsHidden
              />
            ))}
          </View>
        </View>

        {/* CTA — paso 4: "Hacer esto más tarde"; pasos 1-3: siguiente/empezar */}
        {isLast ? (
          <Pressable
            testID="onboarding-skip-platforms"
            className="w-full border border-gray-700 rounded-xl py-4 items-center active:opacity-80"
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.cta_skip_platforms')}
            style={{ minHeight: 52 }}
          >
            <Text className="text-gray-400 font-medium text-base">
              {t('onboarding.cta_skip_platforms')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('onboarding.cta_start') : t('onboarding.cta_next')}
            style={{ minHeight: 52 }}
          >
            <Text className="text-white font-semibold text-base">
              {isLast ? t('onboarding.cta_start') : t('onboarding.cta_next')}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
