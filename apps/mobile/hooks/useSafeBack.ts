import { router } from 'expo-router';

// Devuelve una función de navegación "hacia atrás" segura.
// Si hay historial la usa; si no (deep link, push notification, onboarding con replace)
// redirige a la raíz de tabs para que el usuario nunca quede fuera de la app.
export function useSafeBack(): () => void {
  return function safeBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };
}
