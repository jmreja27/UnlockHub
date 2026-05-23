import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Share,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Friendship } from '@unlockhub/types';

import { useGameDetail, useMyGameAchievements } from '../../hooks/useSearch';
import { useFriends } from '../../hooks/useFriends';
import { SkeletonBox } from '../../components/SkeletonBox';
import { api } from '../../lib/api';
import { FEATURES } from '../../lib/featureFlags';
import { useSessionStore } from '../../stores/sessionStore';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

type AchievementFilter = 'all' | 'earned' | 'pending';

interface AchievementDetail {
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  normalizedPoints: number;
  rarity: number | null;
}

interface Guide {
  id: string;
  content: string;
  upvotes: number;
  user: { id: string; username: string; avatar: string | null };
  createdAt: string;
}

interface GuidesResponse {
  data: Guide[];
  total: number;
}

function getFriendInfo(friendship: Friendship, currentUserId: string) {
  const isSender = friendship.senderId === currentUserId;
  return {
    userId: isSender ? friendship.receiverId : friendship.senderId,
    info: isSender ? friendship.receiver : friendship.sender,
  };
}

// ── Achievement row ────────────────────────────────────────────────────────────

function AchievementRow({
  achievement,
  isEarned,
  onShare,
  onChallenge,
  onWriteGuide,
}: {
  achievement: AchievementDetail;
  isEarned: boolean;
  onShare: () => void;
  onChallenge: () => void;
  onWriteGuide: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [guidesExpanded, setGuidesExpanded] = useState(false);

  const { data: guidesData, isLoading: guidesLoading } = useQuery({
    queryKey: ['achievement-guides', achievement.id],
    queryFn: () =>
      api.get<GuidesResponse>(
        `/api/v1/achievements/${achievement.id}/guides?limit=5`,
      ),
    enabled: guidesExpanded && FEATURES.ugcGuides,
    staleTime: 1000 * 60 * 5,
  });

  const upvoteMutation = useMutation({
    mutationFn: (guideId: string) =>
      api.post<void>(`/api/v1/guides/${guideId}/upvote`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['achievement-guides', achievement.id],
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (guideId: string) =>
      api.post<void>(`/api/v1/guides/${guideId}/report`),
    onSuccess: () => {
      Alert.alert(
        t('game.guides_report_confirm_title'),
        t('game.guides_report_confirmed'),
      );
    },
  });

  const guides = guidesData?.data ?? [];

  return (
    <View
      className="rounded-xl px-3 py-3 mb-2 bg-surface-card"
      style={isEarned ? { borderWidth: 1, borderColor: 'rgba(129,140,248,0.45)' } : undefined}
    >
      {/* Top row: icon + info + action buttons */}
      <View className="flex-row items-center">
        <Image
          source={achievement.iconUrl ?? require('../../assets/images/icon.png')}
          style={{ width: 44, height: 44, borderRadius: 8, opacity: isEarned ? 1 : 0.4 }}
          contentFit="cover"
          accessibilityElementsHidden
        />
        <View className="flex-1 ml-3">
          <Text
            className={`font-semibold text-sm ${isEarned ? 'text-white' : 'text-gray-400'}`}
            numberOfLines={1}
          >
            {achievement.title}
          </Text>
          {achievement.description ? (
            <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={2}>
              {achievement.description}
            </Text>
          ) : null}
          <View className="flex-row items-center mt-1 gap-3">
            <Text className="text-primary-light text-xs font-medium">
              {achievement.normalizedPoints} XP
            </Text>
            {achievement.rarity != null && (
              <Text className="text-gray-500 text-xs">
                {t('game.rarity', { pct: achievement.rarity.toFixed(1) })}
              </Text>
            )}
            {isEarned && <Text className="text-green-400 text-xs font-medium">✓</Text>}
          </View>
        </View>

        {/* Botones de acción */}
        <View style={{ gap: 2 }}>
          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={t('game.share_achievement')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text className="text-gray-500 text-base">⬆</Text>
          </Pressable>
          {!isEarned && (
            <Pressable
              onPress={onChallenge}
              accessibilityRole="button"
              accessibilityLabel={t('game.challenge_friend_label')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text className="text-base">🎯</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Sección de guías */}
      {FEATURES.ugcGuides && (
        <View className="mt-2">
          <Pressable
            onPress={() => setGuidesExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              guidesExpanded ? t('game.guides_collapse') : t('game.guides_expand')
            }
            accessibilityState={{ expanded: guidesExpanded }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text className="text-primary-light text-xs font-medium">
              {guidesExpanded ? t('game.guides_collapse') : t('game.guides_expand')}
            </Text>
          </Pressable>

          {guidesExpanded && (
            <View className="mt-2 border-t border-gray-800 pt-2">
              {guidesLoading ? (
                <SkeletonBox className="h-12 rounded-lg mb-2" />
              ) : guides.length === 0 ? (
                <Text className="text-gray-600 text-xs italic mb-2">
                  {t('game.guides_empty')}
                </Text>
              ) : (
                guides.map((guide) => (
                  <View key={guide.id} className="mb-2 bg-surface-2 rounded-lg p-2.5">
                    <Text className="text-gray-300 text-xs leading-4" numberOfLines={4}>
                      {guide.content}
                    </Text>
                    <View className="flex-row items-center justify-between mt-1.5">
                      <Text className="text-gray-600 text-xs">
                        {t('game.guides_written_by', { username: guide.user.username })}
                      </Text>
                      <View className="flex-row gap-4">
                        <Pressable
                          onPress={() => upvoteMutation.mutate(guide.id)}
                          disabled={upvoteMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={t('game.guides_upvote')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text className="text-primary-light text-xs">▲ {guide.upvotes}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => reportMutation.mutate(guide.id)}
                          disabled={reportMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={t('game.guides_report')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text className="text-gray-600 text-xs">{t('game.guides_report')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <Pressable
                onPress={onWriteGuide}
                className="py-2 items-center rounded-lg border border-dashed border-gray-700 mt-1"
                accessibilityRole="button"
                accessibilityLabel={t('game.guides_write')}
              >
                <Text className="text-gray-400 text-xs">{t('game.guides_write')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useSessionStore();
  const currentUserId = user?.id ?? '';

  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [sortByRarity, setSortByRarity] = useState(false);
  const [challengeAchievementId, setChallengeAchievementId] = useState<string | null>(null);
  const [writeGuideAchievementId, setWriteGuideAchievementId] = useState<string | null>(null);
  const [guideContent, setGuideContent] = useState('');
  const { data: game, isLoading, isError } = useGameDetail(id ?? null);
  const { data: myAchievements } = useMyGameAchievements(id ?? null);
  const { friends } = useFriends();

  const earnedSet = useMemo(
    () => new Set((myAchievements ?? []).map((a) => a.achievementId)),
    [myAchievements],
  );

  const filteredAchievements = useMemo(() => {
    if (!game) return [];
    let list = game.achievements as AchievementDetail[];
    if (filter === 'earned') list = list.filter((a) => earnedSet.has(a.id));
    if (filter === 'pending') list = list.filter((a) => !earnedSet.has(a.id));
    if (sortByRarity) {
      list = [...list].sort((a, b) => (a.rarity ?? 100) - (b.rarity ?? 100));
    }
    return list;
  }, [game, filter, sortByRarity, earnedSet]);

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'ACCEPTED'),
    [friends],
  );

  const FILTERS: { key: AchievementFilter; label: string }[] = [
    { key: 'all', label: t('game.filter_all') },
    { key: 'earned', label: t('game.filter_earned') },
    { key: 'pending', label: t('game.filter_pending') },
  ];

  // ── Mutations ────────────────────────────────────────────────────────────────

  const challengeMutation = useMutation({
    mutationFn: ({ achievementId, friendId }: { achievementId: string; friendId: string }) =>
      api.post<void>(`/api/v1/achievements/${achievementId}/challenge`, { friendId }),
    onSuccess: () => setChallengeAchievementId(null),
    onError: () => Alert.alert(t('common.error_generic')),
  });

  const writeGuideMutation = useMutation({
    mutationFn: ({ achievementId, content }: { achievementId: string; content: string }) =>
      api.post<Guide>(`/api/v1/achievements/${achievementId}/guides`, { content }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ['achievement-guides', vars.achievementId],
      });
      setWriteGuideAchievementId(null);
      setGuideContent('');
    },
    onError: () => Alert.alert(t('common.error_generic')),
  });

  // ── Callbacks ────────────────────────────────────────────────────────────────

  const handleShare = useCallback(
    (achievement: AchievementDetail) => {
      void Share.share({ message: t('game.share_text', { title: achievement.title }) });
    },
    [t],
  );

  const handleChallenge = useCallback((achievementId: string) => {
    setChallengeAchievementId(achievementId);
  }, []);

  const handleWriteGuide = useCallback((achievementId: string) => {
    setGuideContent('');
    setWriteGuideAchievementId(achievementId);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1">
        {/* Header */}
        <View className="px-4 pt-2 pb-3">
          <Pressable
            onPress={() => router.back()}
            className="self-start mb-4"
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-primary-light text-base">{t('common.back')}</Text>
          </Pressable>

          {isLoading ? (
            <>
              <SkeletonBox className="h-7 w-48 rounded-lg mb-2" />
              <SkeletonBox className="h-4 w-24 rounded-lg" />
            </>
          ) : isError || !game ? (
            <Text className="text-red-400 text-base">{t('search.game_not_found')}</Text>
          ) : (
            <View className="flex-row items-center">
              <Image
                source={game.iconUrl ?? require('../../assets/images/icon.png')}
                style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#1e293b' }}
                contentFit="contain"
                accessibilityElementsHidden
              />
              <View className="ml-3 flex-1">
                <Text
                  className="text-white text-xl font-bold"
                  accessibilityRole="header"
                  numberOfLines={2}
                >
                  {game.title}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {PLATFORM_LABEL[game.platform] ?? game.platform}
                  {game.console ? ` · ${game.console}` : ''}
                  {' · '}
                  {isAuthenticated && myAchievements
                    ? t('game.earned_progress', {
                        earned: myAchievements.length,
                        total: game.totalAchievements,
                        pct: game.totalAchievements > 0
                          ? Math.round((myAchievements.length / game.totalAchievements) * 100)
                          : 0,
                      })
                    : t('search.achievements_count', { count: game.totalAchievements })}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Filtros y orden */}
        {!isLoading && game && (
          <View className="px-4 mb-2">
            <View
              className="flex-row bg-surface-2 rounded-xl p-1 mb-2"
              accessibilityRole="tablist"
              accessibilityLabel={t('game.filter_label')}
            >
              {FILTERS.map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  className={`flex-1 py-2 rounded-lg items-center ${filter === key ? 'bg-primary' : ''}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === key }}
                  accessibilityLabel={label}
                >
                  <Text
                    className={`text-xs font-semibold ${filter === key ? 'text-white' : 'text-gray-400'}`}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setSortByRarity((v) => !v)}
              className={`self-start flex-row items-center px-3 py-1.5 rounded-full border ${
                sortByRarity ? 'border-primary bg-primary/20' : 'border-gray-700 bg-transparent'
              }`}
              accessibilityRole="button"
              accessibilityLabel={t('game.sort_by_rarity')}
              accessibilityState={{ selected: sortByRarity }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                className={`text-xs font-medium ${sortByRarity ? 'text-primary-light' : 'text-gray-400'}`}
              >
                {t('game.sort_by_rarity')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Lista de logros */}
        {isLoading ? (
          <View className="px-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonBox key={i} className="h-20 rounded-xl mb-2" />
            ))}
          </View>
        ) : game && filteredAchievements.length > 0 ? (
          <FlashList
            data={filteredAchievements}
            keyExtractor={(a) => a.id}
            estimatedItemSize={100}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: achievement }) => {
              const isEarned = earnedSet.has(achievement.id);
              return (
                <AchievementRow
                  achievement={achievement}
                  isEarned={isEarned}
                  onShare={() => handleShare(achievement)}
                  onChallenge={() => handleChallenge(achievement.id)}
                  onWriteGuide={() => handleWriteGuide(achievement.id)}
                />
              );
            }}
          />
        ) : game && filteredAchievements.length === 0 ? (
          <Text className="text-gray-500 text-sm text-center mt-12 px-8">
            {filter === 'all'
              ? t('game.no_achievements')
              : filter === 'earned' && !isAuthenticated
              ? t('game.link_platform_to_see_progress', {
                  platform: PLATFORM_LABEL[game.platform] ?? game.platform,
                })
              : t('game.no_filtered_achievements')}
          </Text>
        ) : null}
      </View>

      {/* ── Modal: retar a un amigo ─────────────────────────────────────────── */}
      <Modal
        visible={challengeAchievementId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setChallengeAchievementId(null)}
      >
        <View
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          accessibilityViewIsModal
        >
          <SafeAreaView edges={['bottom']} className="bg-surface rounded-t-2xl">
            <View className="px-4 pt-2 pb-2">
              <Text className="text-white font-bold text-base mb-0.5">
                {t('game.challenge_select_friend')}
              </Text>
              <Text className="text-gray-500 text-xs mb-3">
                {t('game.challenge_friend')}
              </Text>
            </View>

            {acceptedFriends.length === 0 ? (
              <View className="px-4 pb-6">
                <Text className="text-gray-400 text-sm">{t('game.no_friends')}</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 300 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {acceptedFriends.map((friendship) => {
                  const { userId: friendId, info: friend } = getFriendInfo(
                    friendship,
                    currentUserId,
                  );
                  return (
                    <Pressable
                      key={friendship.id}
                      onPress={() => {
                        if (challengeAchievementId && !challengeMutation.isPending) {
                          challengeMutation.mutate({
                            achievementId: challengeAchievementId,
                            friendId,
                          });
                        }
                      }}
                      className="flex-row items-center py-3 border-b border-gray-800"
                      accessibilityRole="button"
                      accessibilityLabel={`${t('game.challenge_friend')} ${friend?.username ?? friendId}`}
                    >
                      <Image
                        source={friend?.avatar ?? require('../../assets/images/icon.png')}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                        contentFit="cover"
                        accessibilityElementsHidden
                      />
                      <Text className="text-white ml-3 text-sm font-medium flex-1">
                        {friend?.username ?? friendId}
                      </Text>
                      {challengeMutation.isPending && (
                        <ActivityIndicator size="small" color="#818cf8" />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              onPress={() => setChallengeAchievementId(null)}
              className="mx-4 mt-3 mb-2 py-3 items-center rounded-xl border border-gray-700"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text className="text-gray-400 text-sm">{t('common.cancel')}</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Modal: escribir guía ───────────────────────────────────────────── */}
      <Modal
        visible={writeGuideAchievementId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setWriteGuideAchievementId(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
            accessibilityViewIsModal
          />
          <SafeAreaView edges={['bottom']} className="bg-surface rounded-t-2xl">
            <View className="px-4 pt-4 pb-4">
              <Text className="text-white font-bold text-base mb-3">
                {t('game.guides_write')}
              </Text>
              <TextInput
                value={guideContent}
                onChangeText={setGuideContent}
                placeholder={t('game.guide_placeholder')}
                placeholderTextColor="#64748b"
                multiline
                textAlignVertical="top"
                className="bg-surface-2 rounded-xl px-3 py-2.5 text-white text-sm"
                style={{ minHeight: 120 }}
                accessibilityLabel={t('game.guide_placeholder')}
                accessibilityHint={t('game.guide_min_length')}
                maxLength={2000}
              />
              <Text className="text-gray-600 text-xs mt-1 text-right">
                {guideContent.length}/2000
              </Text>

              {guideContent.trim().length > 0 && guideContent.trim().length < 20 && (
                <Text className="text-red-400 text-xs mt-1">
                  {t('game.guide_min_length')}
                </Text>
              )}

              <Pressable
                onPress={() => {
                  if (
                    writeGuideAchievementId &&
                    guideContent.trim().length >= 20 &&
                    !writeGuideMutation.isPending
                  ) {
                    writeGuideMutation.mutate({
                      achievementId: writeGuideAchievementId,
                      content: guideContent.trim(),
                    });
                  }
                }}
                disabled={guideContent.trim().length < 20 || writeGuideMutation.isPending}
                className={`mt-3 py-3 items-center rounded-xl ${
                  guideContent.trim().length >= 20 && !writeGuideMutation.isPending
                    ? 'bg-primary'
                    : 'bg-gray-700'
                }`}
                accessibilityRole="button"
                accessibilityLabel={t('game.guide_submit')}
                accessibilityState={{
                  disabled: guideContent.trim().length < 20 || writeGuideMutation.isPending,
                }}
              >
                {writeGuideMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    className={`text-sm font-semibold ${
                      guideContent.trim().length >= 20 ? 'text-white' : 'text-gray-500'
                    }`}
                  >
                    {t('game.guide_submit')}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => setWriteGuideAchievementId(null)}
                className="mt-2 py-2 items-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text className="text-gray-400 text-sm">{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
