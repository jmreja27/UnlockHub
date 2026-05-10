// Componente skeleton genérico animado para estados de carga
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonBoxProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  className?: string;
}

export function SkeletonBox({
  width,
  height = 20,
  borderRadius = 8,
  style,
  className,
}: SkeletonBoxProps) {
  // Opacidad oscilante entre 0.3 y 0.7 para simular la animación de carga
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
      }),
      -1, // infinito
      true, // reversa
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const resolvedWidth = width !== undefined ? width : '100%';

  return (
    <View
      style={style}
      className={className}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Animated.View
        style={[
          {
            width: resolvedWidth as ViewStyle['width'],
            height,
            borderRadius,
            backgroundColor: '#334155',
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}
