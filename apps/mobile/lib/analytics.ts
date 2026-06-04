// Wrapper de analíticas desacoplado del proveedor.
// Proveedor actual: PostHog. Para cambiar de proveedor solo se toca este fichero.
// Modo silencioso si EXPO_PUBLIC_POSTHOG_API_KEY no está definida — no rompe el build.

type Properties = Record<string, string | number | boolean | null | undefined>;

let _posthog: { capture: (event: string, properties?: Properties) => void } | null = null;

async function getPosthog() {
  if (_posthog !== null) return _posthog;

  const apiKey = process.env['EXPO_PUBLIC_POSTHOG_API_KEY'];
  if (!apiKey) {
    // Sin key: stub no-op para no romper builds ni lanzar errores
    _posthog = { capture: () => undefined };
    return _posthog;
  }

  try {
    const { PostHog } = await import('posthog-react-native');
    const client = new PostHog(apiKey, { host: 'https://eu.i.posthog.com' });
    // Cast necesario: nuestro tipo Properties incluye undefined pero PostHog solo acepta JsonType
    _posthog = {
      capture: (event, props) =>
        client.capture(event, props as Record<string, string | number | boolean | null>),
    };
  } catch {
    _posthog = { capture: () => undefined };
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

  // Eventos estándar tipados para evitar typos
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
