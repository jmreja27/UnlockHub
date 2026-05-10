import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useSubscription } from '../hooks/useSubscription';
import { useSessionStore } from '../stores/sessionStore';
import { PLAN_PRICES, type PurchasablePlan } from '../lib/iap';
import { FEATURES } from '../lib/featureFlags';

interface FeatureRowProps {
  label: string;
  included: boolean;
}

function FeatureRow({ label, included }: FeatureRowProps) {
  return (
    <View className="flex-row items-center mb-2">
      <Text
        className={`mr-2 font-bold ${included ? 'text-green-400' : 'text-gray-600'}`}
        accessibilityElementsHidden
      >
        {included ? '✓' : '✗'}
      </Text>
      <Text className={`text-sm ${included ? 'text-gray-300' : 'text-gray-600'}`}>
        {label}
      </Text>
    </View>
  );
}

interface PlanCardProps {
  title: string;
  price: string;
  badge?: string;
  featured?: boolean;
  isCurrent?: boolean;
  features: { label: string; included: boolean }[];
  ctaLabel: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

function PlanCard({
  title, price, badge, featured, isCurrent,
  features, ctaLabel, onPress, isLoading, disabled,
}: PlanCardProps) {
  return (
    <View
      className={`rounded-2xl p-5 mb-4 border ${
        featured
          ? 'bg-primary/20 border-primary/60'
          : 'bg-surface-elevated border-surface-card'
      }`}
      accessible
      accessibilityRole="none"
    >
      {/* Cabecera */}
      <View className="flex-row items-center justify-between mb-1">
        <Text className={`text-base font-bold ${featured ? 'text-primary-light' : 'text-white'}`}>
          {title}
        </Text>
        {badge && (
          <View className="bg-primary/40 rounded-full px-2 py-0.5">
            <Text className="text-primary-light text-xs font-semibold">{badge}</Text>
          </View>
        )}
      </View>

      {/* Precio */}
      <Text className={`text-2xl font-bold mb-4 ${featured ? 'text-white' : 'text-gray-300'}`}>
        {price}
      </Text>

      {/* Características */}
      <View className="mb-5">
        {features.map((f) => (
          <FeatureRow key={f.label} label={f.label} included={f.included} />
        ))}
      </View>

      {/* CTA */}
      <Pressable
        className={`rounded-xl py-3 items-center active:opacity-80 ${
          isCurrent
            ? 'bg-surface-card'
            : featured
            ? 'bg-primary'
            : 'bg-surface-card border border-primary/40'
        }`}
        onPress={onPress}
        disabled={disabled || isLoading || isCurrent}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        accessibilityState={{ disabled: disabled || isLoading || isCurrent, busy: isLoading }}
        style={{ minHeight: 48 }}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text
            className={`font-semibold text-sm ${
              isCurrent ? 'text-gray-500' : 'text-white'
            }`}
          >
            {ctaLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export default function PremiumScreen() {
  const { t } = useTranslation();
  const { isAuthenticated } = useSessionStore();
  const { subscriptionStatus, purchase, isPurchasing } = useSubscription();
  const [activePlan, setActivePlan] = useState<PurchasablePlan | null>(null);

  const isPremium = subscriptionStatus?.isPremium ?? false;
  const currentPlan = subscriptionStatus?.plan ?? null;
  const isLifetime = currentPlan === 'LIFETIME';
  const isMonthly = currentPlan === 'MONTHLY';

  async function handlePurchase(plan: PurchasablePlan) {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActivePlan(plan);
    try {
      await purchase(plan);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('premium.error_title'), t('premium.error_message'));
    } finally {
      setActivePlan(null);
    }
  }

  const FREE_FEATURES = [
    { label: t('premium.feature_sync_60'), included: true },
    { label: t('premium.feature_rankings'), included: true },
    { label: t('premium.feature_friends'), included: true },
    { label: t('premium.feature_no_ads'), included: false },
    { label: t('premium.feature_sync_fast'), included: false },
    { label: t('premium.feature_unlimited_sync'), included: false },
  ];

  const MONTHLY_FEATURES = [
    { label: t('premium.feature_no_ads'), included: true },
    { label: t('premium.feature_sync_fast'), included: true },
    { label: t('premium.feature_unlimited_sync'), included: true },
    { label: t('premium.feature_rankings'), included: true },
    { label: t('premium.feature_friends'), included: true },
    { label: t('premium.feature_cancel_anytime'), included: true },
  ];

  const LIFETIME_FEATURES = [
    { label: t('premium.feature_no_ads_forever'), included: true },
    { label: t('premium.feature_sync_fast'), included: true },
    { label: t('premium.feature_unlimited_sync'), included: true },
    { label: t('premium.feature_one_time'), included: true },
    { label: t('premium.feature_no_renewal'), included: true },
  ];

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
        >
          <Text className="text-primary-light text-base">{t('common.back')}</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text
          className="text-white text-2xl font-bold text-center mt-2 mb-1"
          accessibilityRole="header"
        >
          {t('premium.title')}
        </Text>
        <Text className="text-gray-400 text-sm text-center mb-6">
          {t('premium.subtitle')}
        </Text>

        {/* Banner "próximamente" cuando el billing no está activo */}
        {!FEATURES.premium && (
          <View
            className="bg-primary/10 border border-primary/30 rounded-2xl p-4 mb-5 items-center"
            accessibilityLiveRegion="polite"
          >
            <Text className="text-primary-light font-bold text-base mb-1">
              {t('premium.coming_soon_title')}
            </Text>
            <Text className="text-gray-400 text-sm text-center leading-5">
              {t('premium.coming_soon_subtitle')}
            </Text>
          </View>
        )}

        {/* Plan gratuito */}
        <PlanCard
          title={t('premium.plan_free')}
          price={t('premium.plan_free_price')}
          features={FREE_FEATURES}
          ctaLabel={isPremium ? t('premium.not_your_plan') : t('premium.your_current_plan')}
          isCurrent={!isPremium}
          onPress={() => undefined}
          disabled={!FEATURES.premium}
        />

        {/* Plan mensual */}
        <PlanCard
          title={t('premium.plan_monthly')}
          price={PLAN_PRICES.MONTHLY}
          badge={t('premium.badge_popular')}
          featured
          isCurrent={isMonthly}
          features={MONTHLY_FEATURES}
          ctaLabel={
            !FEATURES.premium
              ? t('premium.coming_soon_cta')
              : isMonthly
              ? t('premium.your_current_plan')
              : t('premium.subscribe_monthly')
          }
          onPress={() => { void handlePurchase('MONTHLY'); }}
          isLoading={isPurchasing && activePlan === 'MONTHLY'}
          disabled={!FEATURES.premium || isPurchasing || isLifetime}
        />

        {/* Plan de por vida */}
        <PlanCard
          title={t('premium.plan_lifetime')}
          price={PLAN_PRICES.LIFETIME}
          badge={t('premium.badge_best_value')}
          isCurrent={isLifetime}
          features={LIFETIME_FEATURES}
          ctaLabel={
            !FEATURES.premium
              ? t('premium.coming_soon_cta')
              : isLifetime
              ? t('premium.your_current_plan')
              : t('premium.buy_lifetime')
          }
          onPress={() => { void handlePurchase('LIFETIME'); }}
          isLoading={isPurchasing && activePlan === 'LIFETIME'}
          disabled={!FEATURES.premium || isPurchasing || isLifetime}
        />

        {/* Nota legal — solo visible cuando el billing está activo */}
        {FEATURES.premium && (
          <Text className="text-gray-600 text-xs text-center mt-2 leading-5">
            {t('premium.legal_note')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
