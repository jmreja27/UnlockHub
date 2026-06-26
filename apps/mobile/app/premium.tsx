import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PURCHASES_ERROR_CODE } from 'react-native-purchases';

import { api } from '../lib/api';
import { useSafeBack } from '../hooks/useSafeBack';
import { useSubscription } from '../hooks/useSubscription';
import { usePremiumPlans } from '../hooks/usePremiumPlans';
import type { PremiumPlan } from '../hooks/usePremiumPlans';
import { FEATURES } from '../lib/featureFlags';
import { ComingSoon } from '../components/ComingSoon';
import { queryKeys } from '../lib/queryKeys';
const PRIVACY_POLICY_URL = 'https://jmreja27.github.io/UnlockHub/privacy-policy.html';
const TERMS_URL = 'https://jmreja27.github.io/UnlockHub/terms-of-service.html';
const POINTS_PER_REDEEM = 300;

function FeatureRow({ label }: { label: string }) {
  return (
    <View className="flex-row items-center mb-3">
      <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
      <Text className="text-gray-200 text-sm ml-2">{label}</Text>
    </View>
  );
}

interface PlanCardProps {
  plan: PremiumPlan;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  const { t } = useTranslation();
  const isAnnual = plan.packageType === 'annual';

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${isAnnual ? t('premium.plan_annual') : t('premium.plan_monthly')} ${plan.price}`}
      className={`rounded-2xl p-4 mb-3 border ${
        selected
          ? 'bg-primary/20 border-primary'
          : 'bg-surface-elevated border-surface-card'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className={`font-bold text-base ${selected ? 'text-primary-light' : 'text-white'}`}>
              {isAnnual ? t('premium.plan_annual') : t('premium.plan_monthly')}
            </Text>
            {isAnnual && (
              <View className="bg-primary/40 rounded-full px-2 py-0.5">
                <Text className="text-primary-light text-xs font-semibold">
                  {t('premium.plan_popular')}
                </Text>
              </View>
            )}
          </View>
          <Text className={`text-xl font-bold mt-1 ${selected ? 'text-white' : 'text-gray-300'}`}>
            {plan.price}
          </Text>
          {isAnnual && plan.savings && (
            <Text className="text-green-400 text-xs mt-0.5">
              {t('premium.plan_per_month', { price: plan.pricePerMonth })}
              {' · '}
              {t('premium.plan_savings', { percent: plan.savings })}
            </Text>
          )}
        </View>
        <View
          className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
            selected ? 'border-primary bg-primary' : 'border-gray-500'
          }`}
        >
          {selected && <View className="w-2 h-2 rounded-full bg-white" />}
        </View>
      </View>
    </Pressable>
  );
}

export default function PremiumScreen() {
  const { t } = useTranslation();
  const safeBack = useSafeBack();
  const { purchase, isPurchasing, restorePurchases, isRestoring } = useSubscription();
  const { plans, isLoading: isLoadingPlans } = usePremiumPlans();
  const [selectedType, setSelectedType] = useState<'monthly' | 'annual'>('annual');
  const [isRedeeming, setIsRedeeming] = useState(false);

  const { data: pointsData } = useQuery({
    queryKey: queryKeys.myPointsTotal(),
    queryFn: () => api.get<{ total: number }>('/api/v1/users/me/points/total'),
    staleTime: 1000 * 60 * 2,
  });

  const pointsBalance = pointsData?.total ?? 0;
  const canRedeem = pointsBalance >= POINTS_PER_REDEEM;

  const selectedPlan = plans.find((p) => p.packageType === selectedType) ?? plans[0];

  // Guard — activar en Fase 4 tras configurar RevenueCat (B18/B19/B20)
  if (!FEATURES.premium) return <ComingSoon />;

  async function handlePurchase() {
    if (!selectedPlan) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(selectedPlan);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('premium.success_title'), t('premium.success_body'), [
        { text: 'OK', onPress: safeBack },
      ]);
    } catch (err) {
      // USER_CANCELLED: no mostrar error — el usuario salió intencionalmente
      const code = (err as { code?: string })?.code;
      if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return;
      Alert.alert(t('premium.error_title'), t('premium.error_purchase'));
    }
  }

  async function handleRedeem() {
    setIsRedeeming(true);
    try {
      await api.post('/api/v1/subscriptions/redeem-points', { points: POINTS_PER_REDEEM });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('premium.success_title'), t('premium.success_body'), [
        { text: 'OK', onPress: safeBack },
      ]);
    } catch {
      Alert.alert(t('premium.error_title'), t('premium.error_purchase'));
    } finally {
      setIsRedeeming(false);
    }
  }

  async function handleRestore() {
    try {
      await restorePurchases();
      Alert.alert(t('premium.restore_success_title'), t('premium.restore_success_body'));
    } catch {
      Alert.alert(t('premium.error_title'), t('premium.error_purchase'));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="flex-row items-center justify-end px-5 pt-3">
        <Pressable
          onPress={safeBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}
          testID="premium-close-button"
        >
          <Ionicons name="close" size={24} color="#94a3b8" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Título */}
        <Text
          className="text-white text-2xl font-bold text-center mt-2 mb-1"
          accessibilityRole="header"
        >
          {t('premium.title')}
        </Text>

        {/* Beneficios */}
        <View className="mt-5 mb-6">
          <FeatureRow label={t('premium.feature_no_ads')} />
          <FeatureRow label={t('premium.feature_sync')} />
          <FeatureRow label={t('premium.feature_shields')} />
          <FeatureRow label={t('premium.feature_stats')} />
        </View>

        {/* Planes */}
        {isLoadingPlans ? (
          <View className="items-center py-6" accessibilityLiveRegion="polite">
            <ActivityIndicator color="#818cf8" />
            <Text className="text-gray-400 text-sm mt-2">{t('premium.loading')}</Text>
          </View>
        ) : (
          plans.map((plan) => (
            <PlanCard
              key={plan.packageType}
              plan={plan}
              selected={selectedType === plan.packageType}
              onSelect={() => { setSelectedType(plan.packageType); }}
            />
          ))
        )}

        {/* CTA principal */}
        <Pressable
          onPress={() => { void handlePurchase(); }}
          disabled={isPurchasing || isLoadingPlans || !selectedPlan}
          accessibilityRole="button"
          accessibilityLabel={selectedPlan ? t('premium.subscribe_button', { price: selectedPlan.price }) : t('premium.loading')}
          accessibilityState={{ disabled: isPurchasing || isLoadingPlans, busy: isPurchasing }}
          style={{ minHeight: 52 }}
          className={`rounded-2xl items-center justify-center mt-2 active:opacity-80 ${
            isPurchasing || isLoadingPlans ? 'bg-primary/50' : 'bg-primary'
          }`}
          testID="premium-subscribe-button"
        >
          {isPurchasing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-base">
              {selectedPlan
                ? t('premium.subscribe_button', { price: selectedPlan.price })
                : t('premium.loading')}
            </Text>
          )}
        </Pressable>

        {/* Separador o */}
        <View className="flex-row items-center my-5">
          <View className="flex-1 h-px bg-surface-card" />
          <Text className="text-gray-500 text-xs mx-3">{t('common.or')}</Text>
          <View className="flex-1 h-px bg-surface-card" />
        </View>

        {/* Canje de puntos */}
        <Pressable
          onPress={() => { void handleRedeem(); }}
          disabled={!canRedeem || isRedeeming}
          accessibilityRole="button"
          accessibilityLabel={t('premium.redeem_points', { points: POINTS_PER_REDEEM })}
          accessibilityState={{ disabled: !canRedeem || isRedeeming }}
          style={{ minHeight: 52 }}
          className={`rounded-2xl border items-center justify-center active:opacity-80 ${
            canRedeem ? 'border-primary/60 bg-primary/10' : 'border-surface-card bg-surface-elevated opacity-60'
          }`}
          testID="premium-redeem-button"
        >
          {isRedeeming ? (
            <ActivityIndicator color="#818cf8" />
          ) : (
            <>
              <Text className={`font-semibold text-sm ${canRedeem ? 'text-primary-light' : 'text-gray-500'}`}>
                {t('premium.redeem_points', { points: POINTS_PER_REDEEM })}
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">
                {t('premium.points_balance', { balance: pointsBalance })}
              </Text>
            </>
          )}
        </Pressable>

        {/* Restaurar + legal */}
        <View className="mt-6 items-center gap-3">
          <Pressable
            onPress={() => { void handleRestore(); }}
            disabled={isRestoring}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: 'center' }}
            testID="premium-restore-button"
          >
            {isRestoring ? (
              <ActivityIndicator color="#94a3b8" size="small" />
            ) : (
              <Text className="text-gray-400 text-sm">{t('premium.restore')}</Text>
            )}
          </Pressable>

          <View className="flex-row gap-3">
            <Pressable onPress={() => { void Linking.openURL(TERMS_URL); }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text className="text-gray-600 text-xs">{t('auth.register.terms_label')}</Text>
            </Pressable>
            <Text className="text-gray-700 text-xs self-center">·</Text>
            <Pressable onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text className="text-gray-600 text-xs">{t('auth.register.privacy_label')}</Text>
            </Pressable>
          </View>

          <Text className="text-gray-600 text-xs text-center leading-5 px-2">
            {t('premium.legal_note')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
