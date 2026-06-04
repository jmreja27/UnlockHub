import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { Friendship } from '@unlockhub/types';

import { useFriends } from '../../hooks/useFriends';
import { useSessionStore } from '../../stores/sessionStore';
import { ApiRequestError } from '../../lib/api';
import { SkeletonBox } from '../../components/SkeletonBox';
import { EmptyState } from '../../components/EmptyState';
import { AdBanner } from '../../components/AdBanner';

type Tab = 'friends' | 'pending';

function classifyError(err: Error | null): 'network' | 'auth' | 'server' {
  if (!err) return 'server';
  if (err instanceof ApiRequestError) {
    if (err.statusCode === 401 || err.statusCode === 403) return 'auth';
    if (err.statusCode >= 500) return 'server';
  }
  if (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network')) return 'network';
  return 'server';
}

function FriendItem({
  item,
  currentUserId,
  onRemove,
  isRemoving,
  onPress,
}: {
  item: Friendship;
  currentUserId: string;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  onPress: (username: string) => void;
}) {
  const { t } = useTranslation();
  const friend = item.senderId === currentUserId ? item.receiver : item.sender;
  if (!friend) return null;

  function handleRemove() {
    Alert.alert(
      t('friends.remove_confirm_title'),
      t('friends.remove_confirm_message', { username: friend!.username }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('friends.remove_friend'),
          style: 'destructive',
          onPress: () => onRemove(item.id),
        },
      ],
    );
  }

  return (
    <TouchableOpacity
      onPress={() => onPress(friend.username)}
      className="flex-row items-center bg-surface-2 mx-4 mb-2 px-4 py-3 rounded-xl"
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${friend.username}, ${t('friends.level_short')} ${friend.level}, ${friend.xp} ${t('friends.xp_short')}`}
      accessibilityHint={t('friends.view_profile_hint')}
    >
      <View className="w-10 h-10 rounded-full bg-primary items-center justify-center mr-3">
        <Text className="text-white font-bold text-base">
          {friend.username.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">{friend.username}</Text>
        <Text className="text-gray-400 text-xs">
          {t('friends.level_short')} {friend.level} · {friend.xp} {t('friends.xp_short')}
        </Text>
      </View>
      <TouchableOpacity
        onPress={handleRemove}
        disabled={isRemoving}
        accessibilityLabel={t('friends.remove_friend_hint', { username: friend.username })}
        accessibilityRole="button"
        className="px-3 py-2 rounded-lg bg-red-500/20"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text className="text-red-400 text-xs font-medium">{t('friends.remove_friend')}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function PendingItem({
  item,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: {
  item: Friendship;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  const { t } = useTranslation();
  const sender = item.sender;
  if (!sender) return null;

  return (
    <View
      className="flex-row items-center bg-surface-2 mx-4 mb-2 px-4 py-3 rounded-xl"
      accessible
      accessibilityLabel={t('friends.pending_item_label', { username: sender.username })}
    >
      <View className="w-10 h-10 rounded-full bg-primary items-center justify-center mr-3">
        <Text className="text-white font-bold text-base">
          {sender.username.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">{sender.username}</Text>
        <Text className="text-gray-400 text-xs">
          {t('friends.level_short')} {sender.level} · {sender.xp} {t('friends.xp_short')}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAccept(item.id); }}
          disabled={isAccepting || isRejecting}
          accessibilityLabel={t('friends.accept_hint', { username: sender.username })}
          accessibilityRole="button"
          className="px-3 py-2 rounded-lg bg-green-500/20"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-green-400 text-xs font-medium">{t('friends.accept')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onReject(item.id)}
          disabled={isAccepting || isRejecting}
          accessibilityLabel={t('friends.reject_hint', { username: sender.username })}
          accessibilityRole="button"
          className="px-3 py-2 rounded-lg bg-red-500/20"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-red-400 text-xs font-medium">{t('friends.reject')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated } = useSessionStore();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [search, setSearch] = useState('');

  const {
    friends, isFriendsLoading, friendsError, refetchFriends,
    pendingRequests, pendingTotal, isPendingLoading,
    acceptRequest, isAccepting,
    rejectRequest, isRejecting,
    removeFriend, isRemoving,
  } = useFriends();

  const filteredFriends = search.trim()
    ? friends.filter((f) => {
        const friend = f.senderId === user?.id ? f.receiver : f.sender;
        return friend?.username.toLowerCase().includes(search.toLowerCase());
      })
    : friends;

  function renderSkeleton() {
    return (
      <View className="gap-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBox key={i} height={64} className="mx-4 rounded-xl" />
        ))}
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['left', 'right']}>
        <View className="px-4 pt-1 pb-2">
          <Text className="text-white text-2xl font-bold" accessibilityRole="header">
            {t('friends.title')}
          </Text>
        </View>
        <EmptyState
          emoji="👥"
          title={t('friends.unauthenticated_title')}
          body={t('friends.unauthenticated_body')}
          ctaLabel={t('friends.unauthenticated_cta')}
          onCta={() => router.replace('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-4 pt-1 pb-2">
        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          {t('friends.title')}
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-4 mb-3 bg-surface-2 rounded-xl p-1">
        {(['friends', 'pending'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg items-center ${activeTab === tab ? 'bg-primary' : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text className={`font-semibold text-sm ${activeTab === tab ? 'text-white' : 'text-gray-400'}`}>
              {t(`friends.tab_${tab}`)}
              {tab === 'pending' && pendingTotal > 0 ? ` (${pendingTotal})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <AdBanner unitId="friends" />

      {/* Buscador (solo en tab amigos) */}
      {activeTab === 'friends' && (
        <View className="mx-4 mb-3">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('friends.search_placeholder')}
            placeholderTextColor="#6b7280"
            accessibilityLabel={t('friends.search_label')}
            className="bg-surface-2 text-white px-4 py-3 rounded-xl text-base"
          />
        </View>
      )}

      {/* Contenido */}
      {activeTab === 'friends' ? (
        isFriendsLoading ? (
          renderSkeleton()
        ) : friendsError ? (
          <View
            className="flex-1 items-center justify-center px-6"
            accessible
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            <Text className="text-white text-lg font-bold text-center mb-2">
              {t('friends.error_title')}
            </Text>
            <Text className="text-gray-400 text-sm text-center mb-6">
              {classifyError(friendsError) === 'network'
                ? t('friends.error_network')
                : classifyError(friendsError) === 'auth'
                  ? t('friends.error_auth')
                  : t('friends.error_server')}
            </Text>
            {classifyError(friendsError) === 'auth' ? (
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                className="px-6 py-3 bg-primary rounded-xl"
                accessibilityRole="button"
                accessibilityLabel={t('friends.login_cta')}
              >
                <Text className="text-white font-semibold">{t('friends.login_cta')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void refetchFriends()}
                className="px-6 py-3 bg-primary rounded-xl"
                accessibilityRole="button"
                accessibilityLabel={t('friends.refresh_label')}
              >
                <Text className="text-white font-semibold">{t('common.retry')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : filteredFriends.length === 0 ? (
          <EmptyState
            emoji="👥"
            title={t('friends.empty_title')}
            body={t('friends.empty_body')}
            ctaLabel={t('friends.empty_cta')}
            onCta={() => router.push('/(tabs)/search')}
          />
        ) : (
          <FlashList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            accessibilityLabel={t('friends.loading_label')}
            refreshControl={
              <RefreshControl
                refreshing={isFriendsLoading}
                onRefresh={() => void refetchFriends()}
                accessibilityLabel={t('friends.refresh_label')}
              />
            }
            renderItem={({ item }) => (
              <FriendItem
                item={item}
                currentUserId={user?.id ?? ''}
                onRemove={removeFriend}
                isRemoving={isRemoving}
                onPress={(username) => router.push(`/profile/${username}`)}
              />
            )}
            ListFooterComponent={<View className="h-6" />}
          />
        )
      ) : (
        isPendingLoading ? (
          renderSkeleton()
        ) : pendingRequests.length === 0 ? (
          <EmptyState
            emoji="📬"
            title={t('friends.empty_pending_title')}
            body={t('friends.empty_pending_body')}
          />
        ) : (
          <FlashList
            data={pendingRequests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PendingItem
                item={item}
                onAccept={acceptRequest}
                onReject={rejectRequest}
                isAccepting={isAccepting}
                isRejecting={isRejecting}
              />
            )}
            ListFooterComponent={<View className="h-6" />}
          />
        )
      )}
    </SafeAreaView>
  );
}
