import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { usePreferencesStore } from '../stores/preferencesStore';

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
          {/* Emoji / ilustración */}
          <View
            className="w-32 h-32 rounded-full items-center justify-center mb-10"
            style={{ backgroundColor: `${step?.color ?? '#6366f1'}20` }}
            accessibilityElementsHidden
          >
            <Text style={{ fontSize: 64 }}>{step?.emoji}</Text>
          </View>

          <Text
            className="text-white text-2xl font-bold text-center mb-4"
            accessibilityRole="header"
          >
            {t(step?.titleKey ?? '')}
          </Text>
          <Text className="text-gray-400 text-base text-center leading-6">
            {t(step?.bodyKey ?? '')}
          </Text>
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

        {/* CTA */}
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
      </View>
    </SafeAreaView>
  );
}
