// Componente reutilizable para un ítem del ranking global
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import type { RankingEntry } from '@unlockhub/types';

import { useTheme } from '../hooks/useTheme';

// Placeholder blurhash para avatares mientras cargan
const AVATAR_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

interface RankingItemProps {
  entry: RankingEntry;
  isCurrentUser?: boolean;
  onPress?: () => void;
}

// Devuelve el color del medal para los 3 primeros puestos
function getMedalColor(rank: number): string {
  if (rank === 1) return '#FFD700'; // Oro
  if (rank === 2) return '#C0C0C0'; // Plata
  if (rank === 3) return '#CD7F32'; // Bronce
  return '#6b7280'; // Gris para el resto
}

export function RankingItem({ entry, isCurrentUser = false, onPress }: RankingItemProps) {
  const colors = useTheme();
  const medalColor = getMedalColor(entry.rank);
  const isTopThree = entry.rank <= 3;

  const accessibilityLabel = isCurrentUser
    ? `Tú: posición ${entry.rank}, ${entry.username}, ${entry.xp.toLocaleString()} XP`
    : `Posición ${entry.rank}: ${entry.username}, ${entry.xp.toLocaleString()} XP`;

  return (
    <Pressable
      className={`flex-row items-center px-4 py-3 rounded-xl mb-2 ${isCurrentUser ? 'bg-primary/20 border border-primary/40' : ''}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress ? 'Pulsa para ver el perfil de este jugador' : undefined}
      style={{ minHeight: 60, backgroundColor: isCurrentUser ? undefined : colors.surface }}
    >
      {/* Número de posición */}
      <View
        className="w-8 items-center justify-center mr-3"
        accessible={false}
        accessibilityElementsHidden
      >
        {isTopThree ? (
          <Text style={{ color: medalColor, fontSize: 20, fontWeight: 'bold' }}>
            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
          </Text>
        ) : (
          <Text className="font-semibold text-sm" style={{ color: colors.textSecondary }}>#{entry.rank}</Text>
        )}
      </View>

      {/* Avatar del usuario */}
      <Image
        source={entry.avatar ?? undefined}
        placeholder={AVATAR_BLURHASH}
        style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }}
        contentFit="cover"
        transition={300}
        accessible={false}
        accessibilityElementsHidden
      />

      {/* Nombre de usuario */}
      <View className="flex-1">
        <Text
          className="font-semibold text-base"
          style={{ color: isCurrentUser ? colors.primary : colors.text }}
          numberOfLines={1}
        >
          {entry.username}
          {isCurrentUser && ' (Tú)'}
        </Text>
        {entry.countryCode && (
          <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{entry.countryCode}</Text>
        )}
      </View>

      {/* XP total */}
      <View className="items-end">
        <Text
          className="font-bold text-base"
          style={{ color: isCurrentUser ? colors.primary : colors.text }}
        >
          {entry.xp.toLocaleString()}
        </Text>
        <Text className="text-xs" style={{ color: colors.textMuted }}>XP</Text>
      </View>
    </Pressable>
  );
}
