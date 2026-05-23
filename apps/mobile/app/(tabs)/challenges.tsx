import { View, Text, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ChallengeMetric } from '@unlockhub/types';

import { useChallenges } from '../../hooks/useChallenges';
import { ApiRequestError } from '../../lib/api';
import { SkeletonBox } from '../../components/SkeletonBox';
import { EmptyState } from '../../components/EmptyState';

function classifyError(err: Error | null): 'network' | 'auth' | 'server' {
  if (!err) return 'server';
  if (err instanceof ApiRequestError) {
    if (err.statusCode === 401 || err.statusCode === 403) return 'auth';
    if (err.statusCode >= 500) return 'server';
  }
  if (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network')) return 'network';
  return 'server';
}

function metricKey(metric: ChallengeMetric): string {
  return `challenges.metric_${metric}`;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <View
      className="h-3 bg-gray-700 rounded-full overflow-hidden mt-2"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        className="h-3 bg-indigo-500 rounded-full"
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

function ChallengeSkeleton() {
  return (
    <View
      className="mx-4 mt-3 p-4 bg-surface-raised rounded-2xl"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SkeletonBox height={22} width="60%" style={{ marginBottom: 10 }} />
      <SkeletonBox height={14} width="90%" style={{ marginBottom: 6 }} />
      <SkeletonBox height={14} width="70%" style={{ marginBottom: 16 }} />
      <SkeletonBox height={12} style={{ borderRadius: 6 }} />
    </View>
  );
}

export default function ChallengesScreen() {
  const { t, i18n } = useTranslation();
  const { challenge, status, progressPct, isLoading, isError, error, refetch } = useChallenges();

  const isCompleted = !!status?.completedAt;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            accessibilityLabel={t('challenges.refresh_label')}
            tintColor="#fff"
          />
        }
      >
        <View className="px-4 pt-2 pb-3 border-b border-gray-800">
          <Text
            className="text-white text-xl font-bold"
            accessibilityRole="header"
          >
            {t('challenges.title')}
          </Text>
        </View>

        {isLoading ? (
          <ChallengeSkeleton />
        ) : isError ? (
          <View
            className="flex-1 items-center justify-center px-6 mt-20"
            accessible
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            <Text className="text-white text-lg font-semibold text-center mb-2">
              {t('challenges.error_title')}
            </Text>
            <Text className="text-gray-400 text-sm text-center">
              {classifyError(error) === 'network'
                ? t('challenges.error_network')
                : classifyError(error) === 'auth'
                  ? t('challenges.error_auth')
                  : t('challenges.error_server')}
            </Text>
          </View>
        ) : !challenge ? (
          <EmptyState
            emoji="🏆"
            title={t('challenges.empty_title')}
            body={t('challenges.empty_body')}
          />
        ) : (
          <View className="mx-4 mt-3 p-4 bg-surface-raised rounded-2xl">
            {isCompleted && (
              <View
                className="bg-green-800 rounded-lg px-3 py-1 mb-3 self-start"
                accessibilityLabel={t('challenges.completed_label')}
                accessibilityRole="text"
              >
                <Text className="text-green-200 text-sm font-semibold">
                  {t('challenges.completed')}
                </Text>
              </View>
            )}

            <Text className="text-white text-lg font-bold">
              {challenge.title}
            </Text>
            <Text className="text-gray-400 text-sm mt-1">
              {challenge.description}
            </Text>

            <Text className="text-indigo-400 text-xs mt-3 font-medium">
              {t(metricKey(challenge.metric))}
            </Text>

            <Text className="text-gray-500 text-xs mt-1">
              {t('challenges.ends_at', { date: formatDate(challenge.endAt, i18n.language) })}
            </Text>

            <View className="mt-4">
              <View className="flex-row justify-between">
                <Text
                  className="text-gray-300 text-sm"
                  accessibilityLabel={t('challenges.progress_label', {
                    progress: status?.progress ?? 0,
                    target: challenge.targetValue,
                  })}
                >
                  {status?.progress ?? 0} / {challenge.targetValue}
                </Text>
                <Text
                  className="text-gray-300 text-sm"
                  accessibilityElementsHidden
                >
                  {t('challenges.progress_pct', { pct: progressPct })}
                </Text>
              </View>
              <ProgressBar pct={progressPct} />
            </View>

            <Text className="text-yellow-400 text-sm mt-4 font-semibold">
              {t('challenges.xp_reward', { xp: challenge.xpReward })}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
