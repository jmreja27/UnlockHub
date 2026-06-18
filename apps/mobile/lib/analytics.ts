// Wrapper de analíticas desacoplado del proveedor.
// Proveedor actual: PostHog. Para cambiar de proveedor solo se toca este fichero.
// Modo silencioso si EXPO_PUBLIC_POSTHOG_API_KEY no está definida — no rompe el build.

type Properties = Record<string, string | number | boolean | null | undefined>;

interface PosthogClient {
  capture: (event: string, properties?: Properties) => void;
  identify: (userId: string, properties?: Properties) => void;
  reset: () => void;
  flush: () => Promise<void>;
}

let _posthog: PosthogClient | null = null;

async function getPosthog(): Promise<PosthogClient> {
  if (_posthog !== null) return _posthog;

  const apiKey = process.env['EXPO_PUBLIC_POSTHOG_API_KEY'];
  const noopClient: PosthogClient = {
    capture: () => undefined,
    identify: () => undefined,
    reset: () => undefined,
    flush: () => Promise.resolve(),
  };

  if (!apiKey) {
    // Sin key: stub no-op para no romper builds ni lanzar errores
    _posthog = noopClient;
    return _posthog;
  }

  try {
    const { PostHog } = await import('posthog-react-native');
    // flushAt/flushInterval más agresivos que los defaults (20/10000ms)
    // para minimizar pérdida de eventos si la app se cierra entre flushes periódicos.
    // El SDK ya hace flush automático en cada cambio de AppState (active/background),
    // así que no añadimos un listener manual.
    const client = new PostHog(apiKey, {
      host: 'https://eu.i.posthog.com',
      flushAt: 10,
      flushInterval: 5000,
    });
    _posthog = {
      capture: (event, props) =>
        client.capture(event, props as Record<string, string | number | boolean | null>),
      identify: (userId, props) =>
        client.identify(userId, props as Record<string, string | number | boolean | null>),
      reset: () => client.reset(),
      flush: () => client.flush(),
    };
  } catch {
    _posthog = noopClient;
  }

  return _posthog;
}

export const analytics = {
  async track(event: string, properties?: Properties): Promise<void> {
    try {
      const ph = await getPosthog();
      ph.capture(event, properties);
    } catch {
      // Silencioso — las analíticas nunca deben romper la app
    }
  },

  async identify(userId: string, properties?: Properties): Promise<void> {
    try {
      const ph = await getPosthog();
      ph.identify(userId, properties);
    } catch {
      // Silencioso
    }
  },

  async reset(): Promise<void> {
    try {
      const ph = await getPosthog();
      ph.reset();
    } catch {
      // Silencioso
    }
  },

  async flush(): Promise<void> {
    try {
      const ph = await getPosthog();
      await ph.flush();
    } catch {
      // Silencioso
    }
  },

  // Eventos tipados para evitar typos
  appOpen: () => analytics.track('app_open'),
  syncCompleted: (platform: string) => analytics.track('sync_completed', { platform }),
  onboardingCompleted: () => analytics.track('onboarding_completed'),
  platformLinked: (platform: string) => analytics.track('platform_linked', { platform }),
  achievementViewed: (achievementId: string, platform: string) =>
    analytics.track('achievement_viewed', { achievementId, platform }),
  challengeCompleted: (challengeId: string, points: number) =>
    analytics.track('challenge_completed', { challengeId, points }),
  profileShared: () => analytics.track('profile_shared'),
  wrappedShared: (period: string) => analytics.track('wrapped_shared', { period }),
  premiumPaywallSeen: (feature: string) => analytics.track('premium_paywall_seen', { feature }),
  premiumPurchased: (plan: string) => analytics.track('premium_purchased', { plan }),
  guideWritten: (achievementId: string) => analytics.track('guide_written', { achievementId }),
  friendChallenged: (achievementId: string) =>
    analytics.track('friend_challenged', { achievementId }),
  pointsRedeemed: (points: number, days: number) =>
    analytics.track('points_redeemed', { points, days }),
};

// Arranca el dynamic import en background al cargar el módulo para que el cliente
// esté listo antes del primer analytics.track(). No bloquea ni lanza errores.
void getPosthog();
