import { renderHook, act } from '@testing-library/react-native';

jest.mock('react-native-google-mobile-ads', () => ({
  RewardedAd: { createForAdRequest: jest.fn() },
  AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
}));

jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('../../lib/api', () => ({
  api: { post: jest.fn() },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

import { useRewardedAd } from '../../hooks/useRewardedAd';
import { useSessionStore } from '../../stores/sessionStore';
import { api } from '../../lib/api';

type ListenerHandler = (reward?: { amount: number }) => void;

type AdmobMock = {
  RewardedAd: { createForAdRequest: jest.Mock };
};

const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads') as AdmobMock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockApiPost = api.post as jest.Mock;

function createMockAd() {
  const listeners: Record<string, ListenerHandler[]> = {};
  const addAdEventListener = jest.fn((event: string, handler: ListenerHandler) => {
    listeners[event] = listeners[event] ?? [];
    listeners[event].push(handler);
    return () => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
    };
  });
  const trigger = (event: string, reward?: { amount: number }) => {
    (listeners[event] ?? []).slice().forEach((h) => h(reward));
  };
  return {
    load: jest.fn(),
    show: jest.fn(),
    addAdEventListener,
    trigger,
  };
}

describe('useRewardedAd', () => {
  let ad: ReturnType<typeof createMockAd>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    ad = createMockAd();
    RewardedAd.createForAdRequest.mockReturnValue(ad);
    mockUseSessionStore.mockImplementation(
      (selector: (s: { user: { isPremium: boolean } }) => unknown) =>
        selector({ user: { isPremium: false } }),
    );
    mockApiPost.mockResolvedValue({ pointsEarned: 10 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('BUG 1 — listener de ERROR y backoff', () => {
    it('LOADED marca adState "ready" e isReady true', () => {
      const { result } = renderHook(() => useRewardedAd());

      expect(result.current.adState).toBe('loading');

      act(() => {
        ad.trigger('rewarded_loaded');
      });

      expect(result.current.adState).toBe('ready');
      expect(result.current.isReady).toBe(true);
    });

    it('ERROR una vez mantiene "loading" y reintenta load() tras 5000ms', () => {
      renderHook(() => useRewardedAd());
      expect(ad.load).toHaveBeenCalledTimes(1);

      act(() => {
        ad.trigger('error');
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(ad.load).toHaveBeenCalledTimes(2);
    });

    it('ERROR x4 agota los 3 reintentos y pasa a "unavailable" sin más load() automático', () => {
      const { result } = renderHook(() => useRewardedAd());

      act(() => {
        ad.trigger('error'); // intento 1 programado (5000ms)
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      act(() => {
        ad.trigger('error'); // intento 2 programado (15000ms)
      });
      act(() => {
        jest.advanceTimersByTime(15000);
      });
      act(() => {
        ad.trigger('error'); // intento 3 programado (30000ms)
      });
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(result.current.adState).toBe('loading');

      act(() => {
        ad.trigger('error'); // 4º error — reintentos agotados
      });

      expect(result.current.adState).toBe('unavailable');

      const loadCallsAtUnavailable = ad.load.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      expect(ad.load).toHaveBeenCalledTimes(loadCallsAtUnavailable);
    });

    it('LOADED tras un ERROR intermedio resetea el contador de reintentos', () => {
      const { result } = renderHook(() => useRewardedAd());

      act(() => {
        ad.trigger('error'); // contador a 1
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      act(() => {
        ad.trigger('rewarded_loaded'); // resetea contador a 0
      });

      expect(result.current.adState).toBe('ready');

      // Un nuevo ciclo de errores debe permitir de nuevo 3 reintentos completos
      act(() => {
        ad.trigger('error');
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      act(() => {
        ad.trigger('error');
      });
      act(() => {
        jest.advanceTimersByTime(15000);
      });
      act(() => {
        ad.trigger('error');
      });

      expect(result.current.adState).toBe('loading');

      act(() => {
        ad.trigger('error'); // 4º del nuevo ciclo — ahora sí agota
      });

      expect(result.current.adState).toBe('unavailable');
    });

    it('desmontar con un reintento pendiente no llama a load() tras el unmount', () => {
      const { unmount } = renderHook(() => useRewardedAd());
      const loadCallsBeforeUnmount = ad.load.mock.calls.length;

      act(() => {
        ad.trigger('error'); // programa un reintento a 5000ms
      });

      unmount();

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(ad.load).toHaveBeenCalledTimes(loadCallsBeforeUnmount);
    });
  });

  describe('BUG 2 — recompensa solo tras EARNED_REWARD', () => {
    it('EARNED_REWARD otorga la recompensa (POST + puntos)', async () => {
      const { result } = renderHook(() => useRewardedAd());
      act(() => {
        ad.trigger('rewarded_loaded');
      });

      let promise: Promise<number | null> | undefined;
      act(() => {
        promise = result.current.showForReward();
      });

      act(() => {
        ad.trigger('rewarded_earned_reward');
      });
      act(() => {
        ad.trigger('closed');
      });

      const points = await promise!;

      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/users/me/points/rewarded-ad');
      expect(points).toBe(10);
    });

    it('CLOSED sin EARNED_REWARD previo (usuario saltó el anuncio) no otorga puntos ni cuelga la UI', async () => {
      const { result } = renderHook(() => useRewardedAd());
      act(() => {
        ad.trigger('rewarded_loaded');
      });

      let promise: Promise<number | null> | undefined;
      act(() => {
        promise = result.current.showForReward();
      });

      act(() => {
        ad.trigger('closed');
      });

      const points = await promise!;

      expect(mockApiPost).not.toHaveBeenCalled();
      expect(points).toBeNull();
    });

    it('flujo feliz completo: LOADED → show → EARNED_REWARD → recompensa → CLOSED recarga el siguiente anuncio', async () => {
      const { result } = renderHook(() => useRewardedAd());
      act(() => {
        ad.trigger('rewarded_loaded');
      });

      const loadCallsBeforeShow = ad.load.mock.calls.length;

      let promise: Promise<number | null> | undefined;
      act(() => {
        promise = result.current.showForReward();
      });

      expect(ad.show).toHaveBeenCalledTimes(1);

      act(() => {
        ad.trigger('rewarded_earned_reward');
      });
      act(() => {
        ad.trigger('closed');
      });

      const points = await promise!;
      expect(points).toBe(10);

      expect(ad.load.mock.calls.length).toBeGreaterThan(loadCallsBeforeShow);
      expect(result.current.adState).toBe('loading');
    });
  });
});
