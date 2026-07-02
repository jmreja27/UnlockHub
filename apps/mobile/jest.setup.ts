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
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn().mockReturnValue(true) },
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
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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

// react-native-reanimated v4 — mock manual para evitar cargar react-native-worklets nativo.
// requireActual('react-native-reanimated/mock') ya no funciona en v4 porque el mock a su vez
// importa desde ./index → react-native-worklets → inicialización de módulos nativos.
jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual('react-native');
  const NOOP = () => {};
  const sharedValueFactory = (init: unknown) => ({ value: init, get: () => init, set: jest.fn() });

  const AnimatedMock = {
    View: ReactNative.View,
    Text: ReactNative.Text,
    Image: ReactNative.Image,
    ScrollView: ReactNative.ScrollView,
    FlatList: ReactNative.FlatList,
    call: jest.fn(),
    Value: jest.fn((v: unknown) => ({ value: v, setValue: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), interpolate: jest.fn() })),
    event: jest.fn(),
    spring: jest.fn(),
    timing: jest.fn(),
    sequence: jest.fn(),
    parallel: jest.fn(),
    loop: jest.fn(),
    stopAnimation: jest.fn(),
  };

  return {
    __esModule: true,
    default: AnimatedMock,
    View: ReactNative.View,
    Text: ReactNative.Text,
    Image: ReactNative.Image,
    ScrollView: ReactNative.ScrollView,
    FlatList: ReactNative.FlatList,
    useSharedValue: jest.fn(sharedValueFactory),
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    useAnimatedScrollHandler: jest.fn(() => NOOP),
    useAnimatedGestureHandler: jest.fn(() => NOOP),
    useAnimatedReaction: jest.fn(),
    useAnimatedProps: jest.fn(() => ({})),
    useDerivedValue: jest.fn((fn: () => unknown) => sharedValueFactory(fn())),
    useWorkletCallback: jest.fn((fn: unknown) => fn),
    withTiming: jest.fn((value: unknown) => value),
    withSpring: jest.fn((value: unknown) => value),
    withDecay: jest.fn((value: unknown) => value),
    withDelay: jest.fn((_delay: unknown, animation: unknown) => animation),
    withRepeat: jest.fn((animation: unknown) => animation),
    withSequence: jest.fn((...animations: unknown[]) => animations[0]),
    interpolate: jest.fn((_val: unknown, _in: unknown, output: unknown[]) => output[0]),
    interpolateColor: jest.fn((_val: unknown, _in: unknown, output: unknown[]) => output[0]),
    Extrapolation: { CLAMP: 'CLAMP', EXTEND: 'EXTEND', IDENTITY: 'IDENTITY' },
    Easing: {
      linear: jest.fn((t: number) => t),
      ease: jest.fn((t: number) => t),
      quad: jest.fn((t: number) => t),
      cubic: jest.fn((t: number) => t),
      poly: jest.fn(),
      sin: jest.fn((t: number) => t),
      circle: jest.fn((t: number) => t),
      exp: jest.fn((t: number) => t),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn((t: number) => t),
      bezier: jest.fn(),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
      steps: jest.fn(),
    },
    FadeIn: { duration: jest.fn() },
    FadeOut: { duration: jest.fn() },
    FadeInDown: { duration: jest.fn() },
    FadeInUp: { duration: jest.fn() },
    FadeOutDown: { duration: jest.fn() },
    FadeOutUp: { duration: jest.fn() },
    SlideInLeft: { duration: jest.fn() },
    SlideInRight: { duration: jest.fn() },
    SlideOutLeft: { duration: jest.fn() },
    SlideOutRight: { duration: jest.fn() },
    ZoomIn: { duration: jest.fn() },
    ZoomOut: { duration: jest.fn() },
    runOnJS: jest.fn((fn: unknown) => fn),
    runOnUI: jest.fn((fn: unknown) => fn),
    makeMutable: jest.fn(sharedValueFactory),
    isSharedValue: jest.fn(() => false),
    cancelAnimation: jest.fn(),
    measure: jest.fn(),
    scrollTo: jest.fn(),
    createAnimatedComponent: jest.fn((component: unknown) => component),
    addWhitelistedNativeProps: jest.fn(),
    addWhitelistedUIProps: jest.fn(),
    setUpTests: NOOP,
    advanceAnimationByFrame: NOOP,
    advanceAnimationByTime: NOOP,
    withReanimatedTimer: jest.fn((fn: () => void) => fn()),
    getAnimatedStyle: jest.fn((style: unknown) => style),
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    SensorType: { ACCELEROMETER: 0, GYROSCOPE: 1, GRAVITY: 2, MAGNETIC_FIELD: 3, ROTATION: 4 },
    IOSReferenceFrame: { Auto: 0, XArbitraryZVertical: 1, XArbitraryCorrectedZVertical: 2, XMagneticNorthZVertical: 3, XTrueNorthZVertical: 4 },
    InterfaceOrientation: { ROTATION_0: 0, ROTATION_90: 1, ROTATION_180: 2, ROTATION_270: 3 },
    KeyboardState: { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 },
    ColorSpace: { SRGB: 0, P3: 1 },
  };
});

// react-native-purchases (RevenueCat) — módulo nativo, requiere mock en tests
jest.mock('react-native-purchases', () => ({
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    logIn: jest.fn(() => Promise.resolve({ customerInfo: {} })),
    logOut: jest.fn(() => Promise.resolve({ customerInfo: {} })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
  },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
  LOG_LEVEL: { DEBUG: 'DEBUG', ERROR: 'ERROR' },
}));

// @react-native-community/datetimepicker — módulo nativo; el mock renderiza un Pressable que
// dispara onChange con 1995-06-15 al pulsarlo, permitiendo simular selección de fecha en tests.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (event: Record<string, unknown>, date?: Date) => void }) =>
      React.createElement(Pressable, {
        testID: 'mock-date-time-picker',
        onPress: () =>
          onChange(
            { type: 'set', nativeEvent: { timestamp: new Date(1995, 5, 15).getTime() } },
            new Date(1995, 5, 15),
          ),
      }),
  };
});

// @react-native-async-storage/async-storage — módulo nativo, requiere mock en tests
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));
