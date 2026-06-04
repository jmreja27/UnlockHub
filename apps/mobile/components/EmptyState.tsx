import { View, Text, Pressable } from 'react-native';

interface EmptyStateProps {
  emoji: string;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ emoji, title, body, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text style={{ fontSize: 56, marginBottom: 16 }} accessibilityElementsHidden>
        {emoji}
      </Text>
      <Text
        className="text-white text-xl font-bold text-center mb-3"
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text className="text-gray-400 text-sm text-center leading-6 mb-8">
        {body}
      </Text>
      {ctaLabel && onCta && (
        <Pressable
          className="bg-primary rounded-xl px-8 py-3 active:opacity-80"
          onPress={onCta}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={{ minHeight: 48 }}
        >
          <Text className="text-white font-semibold text-sm">{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
