// Pantalla de rankings globales con FlashList, skeleton y posición del usuario destacada
import { useCallback } from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { useGlobalRankings, useMyRanking } from '../../hooks/useRankings';
import { useSessionStore } from '../../stores/sessionStore';
import { RankingItem } from '../../components/RankingItem';
import { SkeletonBox } from '../../components/SkeletonBox';
import type { RankingEntry } from '@unlockhub/types';

// Número de ítems skeleton que se muestran durante la carga inicial
const SKELETON_COUNT = 10;

function RankingSkeletonList() {
  return (
    <View className="px-4 pt-4">
      {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <View
          key={index}
          className="flex-row items-center bg-surface-elevated rounded-xl px-4 py-3 mb-2"
          style={{ minHeight: 60 }}
          accessible={false}
          accessibilityElementsHidden
        >
          {/* Posición */}
          <SkeletonBox width={28} height={20} borderRadius={4} style={{ marginRight: 12 }} />
          {/* Avatar */}
          <SkeletonBox width={40} height={40} borderRadius={20} style={{ marginRight: 12 }} />
          {/* Nombre */}
          <View className="flex-1">
            <SkeletonBox width={120} height={16} borderRadius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width={60} height={12} borderRadius={4} />
          </View>
          {/* XP */}
          <SkeletonBox width={50} height={16} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export default function RankingsScreen() {
  const { user } = useSessionStore();
  const {
    data: rankingsData,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useGlobalRankings(1, 50);

  const { data: myRanking } = useMyRanking();

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: RankingEntry }) => {
      const isCurrentUser = user?.id === item.userId;
      return <RankingItem entry={item} isCurrentUser={isCurrentUser} />;
    },
    [user?.id],
  );

  const keyExtractor = useCallback((item: RankingEntry) => item.userId, []);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="px-4 pt-4 pb-2">
        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          Rankings
        </Text>
        <Text className="text-gray-400 text-sm mt-1">Top jugadores globales</Text>
      </View>

      {/* Tarjeta con la posición del usuario autenticado */}
      {user && myRanking && (
        <View
          className="mx-4 mb-3 bg-primary/20 border border-primary/40 rounded-xl px-4 py-3"
          accessible
          accessibilityLabel={
            myRanking.rank
              ? `Tu posición: #${myRanking.rank} con ${myRanking.xp.toLocaleString()} XP`
              : `Todavía no tienes posición en el ranking. XP acumulado: ${myRanking.xp.toLocaleString()}`
          }
        >
          <Text className="text-gray-400 text-xs mb-1">Tu posición</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-primary-light font-bold text-lg">
              {myRanking.rank ? `#${myRanking.rank}` : '—'}
            </Text>
            <Text className="text-white font-semibold">
              {myRanking.xp.toLocaleString()} XP
            </Text>
          </View>
        </View>
      )}

      {/* Estado de carga — skeleton */}
      {isLoading && <RankingSkeletonList />}

      {/* Estado de error */}
      {isError && !isLoading && (
        <View
          className="flex-1 items-center justify-center px-6"
          accessible
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text className="text-red-400 text-lg font-semibold mb-2">
            No se pudo cargar el ranking
          </Text>
          <Text className="text-gray-400 text-sm text-center mb-6">
            Comprueba tu conexión a internet e inténtalo de nuevo.
          </Text>
          <Text
            className="text-primary-light text-base"
            onPress={() => void refetch()}
            accessibilityRole="button"
            accessibilityLabel="Reintentar carga del ranking"
          >
            Reintentar
          </Text>
        </View>
      )}

      {/* Lista de rankings */}
      {!isLoading && !isError && (
        <FlashList
          data={rankingsData?.data ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={68}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          accessibilityLabel="Lista del ranking global"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor="#818cf8"
              colors={['#4f46e5']}
              accessibilityLabel="Actualizar ranking"
            />
          }
          ListEmptyComponent={
            <View
              className="items-center justify-center py-16"
              accessible
              accessibilityLiveRegion="polite"
            >
              <Text className="text-gray-400 text-base text-center">
                El ranking todavía no tiene jugadores.{'\n'}¡Sé el primero en aparecer!
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
