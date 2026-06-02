import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFriendshipStatus } from '../hooks/useFriendshipStatus';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { useSessionStore } from '../stores/sessionStore';

interface Props {
  username: string;
}

export function FriendshipButton({ username }: Props) {
  const { t } = useTranslation();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const user = useSessionStore((s) => s.user);
  const { data: status, isLoading, isError } = useFriendshipStatus(username);
  const { sendRequest, cancelOrRemove, accept, reject } = useFriendshipActions(username);

  if (!isAuthenticated) return null;

  const isMutating =
    sendRequest.isPending || cancelOrRemove.isPending || accept.isPending || reject.isPending;

  // Muestra spinner mientras carga el estado O si el objeto user no está listo aún
  // (puede ocurrir si isAuthenticated=true pero user se hidrata de forma asíncrona)
  if (isLoading || !user) {
    return (
      <View
        className="mt-4 h-12 bg-surface-elevated rounded-xl items-center justify-center"
        accessibilityLabel={t('common.loading')}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <ActivityIndicator size="small" color="#818cf8" />
      </View>
    );
  }

  if (status?.status === 'blocked') return null;

  // Muestra "Añadir amigo" cuando:
  // (a) status.status === 'none' — estado normal de no-amigos
  // (b) status es undefined && isError — fallback ante error de red
  // Retorna null si status es undefined && !isError — query desactivada (perfil propio)
  if (!status || status.status === 'none') {
    if (!status && !isError) return null;
    return (
      <Pressable
        testID="friendship-btn-add"
        onPress={() => sendRequest.mutate()}
        disabled={isMutating}
        className="mt-4 bg-indigo-600 rounded-xl py-3 items-center justify-center"
        style={{ minHeight: 44 }}
        accessibilityLabel={t('friends.add_friend_hint', { username })}
        accessibilityRole="button"
        accessibilityState={{ busy: isMutating, disabled: isMutating }}
      >
        {isMutating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white font-semibold">{t('friends.add_friend')}</Text>
        )}
      </Pressable>
    );
  }

  function handleRemoveFriend(friendshipId: string) {
    Alert.alert(
      t('friends.remove_confirm_title'),
      t('friends.remove_confirm_body', { username }),
      [
        { text: t('friends.remove_confirm_cancel'), style: 'cancel' },
        {
          text: t('friends.remove_confirm_ok'),
          style: 'destructive',
          onPress: () => cancelOrRemove.mutate(friendshipId),
        },
      ],
    );
  }

  if (status.status === 'pending_sent') {
    const { friendshipId } = status;
    return (
      <View className="mt-4 gap-2">
        <Pressable
          testID="friendship-btn-pending-sent"
          disabled
          className="bg-surface-elevated rounded-xl py-3 items-center justify-center"
          style={{ minHeight: 44 }}
          accessibilityLabel={t('friends.request_sent')}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
        >
          <Text className="text-gray-400 font-semibold">{t('friends.request_sent')}</Text>
        </Pressable>
        <Pressable
          testID="friendship-btn-cancel"
          onPress={() => cancelOrRemove.mutate(friendshipId)}
          disabled={isMutating}
          className="items-center justify-center py-2"
          style={{ minHeight: 44 }}
          accessibilityLabel={t('friends.cancel_request')}
          accessibilityRole="button"
          accessibilityState={{ busy: isMutating, disabled: isMutating }}
        >
          <Text className="text-red-400 text-sm">{t('friends.cancel_request')}</Text>
        </Pressable>
      </View>
    );
  }

  if (status.status === 'pending_received') {
    const { friendshipId } = status;
    return (
      <View className="mt-4 flex-row gap-3">
        <Pressable
          testID="friendship-btn-accept"
          onPress={() => accept.mutate(friendshipId)}
          disabled={isMutating}
          className="flex-1 bg-indigo-600 rounded-xl py-3 items-center justify-center"
          style={{ minHeight: 44 }}
          accessibilityLabel={t('friends.accept_hint', { username })}
          accessibilityRole="button"
          accessibilityState={{ busy: isMutating, disabled: isMutating }}
        >
          {accept.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white font-semibold">{t('friends.accept')}</Text>
          )}
        </Pressable>
        <Pressable
          testID="friendship-btn-reject"
          onPress={() => reject.mutate(friendshipId)}
          disabled={isMutating}
          className="flex-1 bg-surface-elevated rounded-xl py-3 items-center justify-center"
          style={{ minHeight: 44 }}
          accessibilityLabel={t('friends.reject_hint', { username })}
          accessibilityRole="button"
          accessibilityState={{ busy: isMutating, disabled: isMutating }}
        >
          {reject.isPending ? (
            <ActivityIndicator size="small" color="#818cf8" />
          ) : (
            <Text className="text-gray-300 font-semibold">{t('friends.reject')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // accepted
  const { friendshipId } = status;
  return (
    <View className="mt-4 gap-2">
      <Pressable
        testID="friendship-btn-friends"
        disabled
        className="bg-surface-elevated rounded-xl py-3 items-center justify-center"
        style={{ minHeight: 44 }}
        accessibilityLabel={t('friends.already_friends')}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
      >
        <Text className="text-gray-400 font-semibold">{t('friends.already_friends')}</Text>
      </Pressable>
      <Pressable
        testID="friendship-btn-remove"
        onPress={() => handleRemoveFriend(friendshipId)}
        disabled={isMutating}
        className="items-center justify-center py-2"
        style={{ minHeight: 44 }}
        accessibilityLabel={t('friends.remove_friend_hint', { username })}
        accessibilityRole="button"
        accessibilityState={{ busy: isMutating, disabled: isMutating }}
      >
        <Text className="text-red-400 text-sm">{t('friends.remove_friend')}</Text>
      </Pressable>
    </View>
  );
}
