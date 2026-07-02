import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useSubscription } from '../hooks/useSubscription';
import { useSessionStore } from '../stores/sessionStore';
import { PLAN_PRICES } from '../lib/iap';
import { FEATURES } from '../lib/featureFlags';
import { formatFullDate } from '../lib/formatTimeAgo';

function formatExpiryDate(isoDate: string | null): string {
  if (!isoDate) return '';
  return formatFullDate(isoDate);
}

function FreeBanner() {
  const { t } = useTranslation();

  function handlePress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/premium');
  }

  return (
    <Pressable
      className="mx-6 mb-4 bg-primary/20 border border-primary/40 rounded-2xl px-4 py-4 active:opacity-80"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('premium.banner_cta')}
      accessibilityHint={t('premium.banner_hint')}
      style={{ minHeight: 44 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-primary-light font-bold text-sm mb-0.5">
            {t('premium.banner_title')}
          </Text>
          <Text className="text-gray-400 text-xs">
            {t('premium.banner_subtitle', { price: PLAN_PRICES.MONTHLY })}
          </Text>
        </View>
        <View className="bg-primary/30 rounded-full px-3 py-1" accessibilityElementsHidden>
          <Text className="text-primary-light text-xs font-semibold">{t('premium.banner_action')}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function PremiumActiveBanner({
  plan,
  expiresAt,
}: {
  plan: string | null;
  expiresAt: string | null;
}) {
  const { t } = useTranslation();
  const isLifetime = plan === 'LIFETIME';

  return (
    <View
      className="mx-6 mb-4 bg-surface-elevated border border-primary/30 rounded-2xl px-4 py-4"
      accessible
      accessibilityLabel={
        isLifetime
          ? t('premium.active_lifetime_aria')
          : expiresAt
          ? t('premium.active_monthly_aria', { date: formatExpiryDate(expiresAt) })
          : t('premium.active_aria')
      }
      accessibilityRole="text"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-primary-light font-bold text-sm mb-0.5">
            {isLifetime ? t('premium.active_lifetime') : t('premium.active_monthly')}
          </Text>
          <Text className="text-gray-400 text-xs">
            {isLifetime
              ? t('premium.active_lifetime_desc')
              : expiresAt
              ? t('premium.active_expires', { date: formatExpiryDate(expiresAt) })
              : ''}
          </Text>
        </View>
        <Text className="text-green-400 text-lg" accessibilityElementsHidden>✓</Text>
      </View>
    </View>
  );
}

export function PremiumBanner() {
  const { isAuthenticated } = useSessionStore();
  const { subscriptionStatus, isLoadingStatus } = useSubscription();

  if (!FEATURES.premium) return null;
  if (!isAuthenticated || isLoadingStatus) return null;

  if (subscriptionStatus?.isPremium) {
    return (
      <PremiumActiveBanner
        plan={subscriptionStatus.plan}
        expiresAt={subscriptionStatus.expiresAt}
      />
    );
  }

  return <FreeBanner />;
}
