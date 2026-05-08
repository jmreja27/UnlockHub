// Mocks globales para todos los tests de la app mobile

// react-i18next — devuelve la clave con interpolación básica
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      return Object.entries(opts).reduce(
        (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
        key,
      );
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty' as const, init: jest.fn() },
}));

// expo-router
jest.mock('expo-router', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    Link: ReactNative.Pressable,
    useLocalSearchParams: jest.fn(() => ({})),
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
    Stack: { Screen: () => null },
    Tabs: { Screen: () => null },
  };
});

// expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

// expo-image → Image nativa de RN
jest.mock('expo-image', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: ReactNative.Image };
});

// expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'US' }],
  getCalendars: () => [{ calendar: 'gregorian' }],
}));

// expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(),
  preventAutoHideAsync: jest.fn(),
}));

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: ReactNative.View,
    SafeAreaProvider: ReactNative.View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// @shopify/flash-list → FlatList de RN (suficiente para tests)
jest.mock('@shopify/flash-list', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { FlashList: ReactNative.FlatList };
});

// @sentry/react-native
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  wrap: (App: unknown) => App,
}));

// socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));

// react-native-google-mobile-ads — no disponible en entorno de test
jest.mock('react-native-google-mobile-ads', () => ({
  BannerAd: null,
  BannerAdSize: { BANNER: 'BANNER' },
}));

// react-native-reanimated — el preset jest-expo ya lo maneja, pero lo forzamos por si acaso
jest.mock('react-native-reanimated', () => {
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  Reanimated.default.call = jest.fn();
  return Reanimated;
});
