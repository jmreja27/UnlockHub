import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, PlatformAccount } from '@unlockhub/types';

import ProfileScreen from '../../app/(tabs)/profile';
import { formatNumber } from '../../lib/formatTimeAgo';
import { useSessionStore } from '../../stores/sessionStore';
import { useAuth } from '../../hooks/useAuth';
import { useRewardedAd } from '../../hooks/useRewardedAd';

jest.mock('../../stores/sessionStore');
jest.mock('../../hooks/useAuth');
jest.mock('../../hooks/useFeed', () => ({
  useFeed: () => ({ events: [], isLoading: false, isError: false, refetch: jest.fn() }),
}));
jest.mock('../../hooks/useRewardedAd');

const mockUseRewardedAd = useRewardedAd as jest.Mock;
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
}));
// Activamos FEATURES.premium para testear el badge — en producción está desactivado (F8 pendiente Play Billing)
jest.mock('../../lib/featureFlags', () => ({
  FEATURES: { premium: true, wrapped: true, pointsRedeem: true, advancedStats: true, ugcGuides: true, notifications: true },
}));
// Mockeamos PremiumBanner y AdBanner para aislar la pantalla de sus dependencias
jest.mock('../../components/PremiumBanner', () => ({ PremiumBanner: () => null }));
jest.mock('../../lib/api');

const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const baseUser: User = {
  id: 'u1',
  username: 'jugador_test',
  email: 'test@test.com',
  avatar: null,
  banner: null,
  bio: null,
  level: 5,
  xp: 1500,
  streakDays: 3,
  countryCode: 'ES',
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  profileVisibility: 'PUBLIC',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const steamAccount: PlatformAccount = {
  id: 'pa-1',
  userId: 'u1',
  platform: 'STEAM',
  externalId: 'steam123',
  username: 'SteamUser99',
  lastSyncedAt: null,
  requiresReauth: false,
  psnProfilePrivate: false,
};

const psnAccountPublic: PlatformAccount = {
  id: 'pa-2',
  userId: 'u1',
  platform: 'PSN',
  externalId: 'psn-account-id',
  username: 'PSNUser99',
  lastSyncedAt: null,
  requiresReauth: false,
  psnProfilePrivate: false,
};

const psnAccountPrivate: PlatformAccount = {
  id: 'pa-3',
  userId: 'u1',
  platform: 'PSN',
  externalId: 'psn-account-id',
  username: 'PSNUser99',
  lastSyncedAt: null,
  requiresReauth: false,
  psnProfilePrivate: true,
};

function renderProfile(mockApiGet?: jest.Mock, mockApiDelete?: jest.Mock, pointsBalance = 0) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { api } = require('../../lib/api') as { api: { get: jest.Mock; delete: jest.Mock } };
  api.get = mockApiGet ?? jest.fn(() => Promise.resolve([]));
  api.delete = mockApiDelete ?? jest.fn(() => Promise.resolve({ ok: true, deletedAchievements: 0 }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pre-poblar caché de puntos para evitar llamadas reales a la API
  client.setQueryData(['my-points-total'], { total: pointsBalance });

  const rendered = render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
  return { ...rendered, client };
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      logout: jest.fn(),
      isLoggingOut: false,
    });
    mockUseRewardedAd.mockReturnValue({
      showForReward: jest.fn().mockResolvedValue(10),
      isReady: true,
      adState: 'ready',
      retryLoad: jest.fn(),
    });
  });

  describe('estado no autenticado', () => {
    beforeEach(() => {
      mockUseSessionStore.mockReturnValue({ user: null, isAuthenticated: false });
    });

    it('muestra el tÃ­tulo con accessibilityRole="header"', () => {
      const { getByRole } = renderProfile();
      expect(getByRole('header')).toBeTruthy();
    });

    it('muestra el mensaje para usuarios no autenticados', () => {
      const { getByText } = renderProfile();
      expect(getByText('profile.unauthenticated_message')).toBeTruthy();
    });

    it('renderiza el botÃ³n de inicio de sesiÃ³n', () => {
      const { getByRole } = renderProfile();
      expect(getByRole('button', { name: 'profile.login' })).toBeTruthy();
    });

    it('navega a la pantalla de login al pulsar el botÃ³n', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
      const { router } = require('expo-router') as typeof import('expo-router');
      const { getByRole } = renderProfile();
      fireEvent.press(getByRole('button', { name: 'profile.login' }));
      expect(router.push).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  describe('estado autenticado', () => {
    beforeEach(() => {
      mockUseSessionStore.mockReturnValue({ user: baseUser, isAuthenticated: true });
    });

    it('muestra el nombre de usuario', async () => {
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('jugador_test')).toBeTruthy());
    });

    it('muestra el nivel del usuario', async () => {
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('5')).toBeTruthy());
    });

    it('muestra el XP del usuario', async () => {
      const { getByText } = renderProfile();
      // El mock global de useTranslation devuelve i18n.language = 'en'
      await waitFor(() => expect(getByText(formatNumber(1500, 'en'))).toBeTruthy());
    });

    it('muestra la racha de dÃ­as', async () => {
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('3')).toBeTruthy());
    });

    it('muestra el bio cuando existe', async () => {
      mockUseSessionStore.mockReturnValue({
        user: { ...baseUser, bio: 'Amante de los logros' },
        isAuthenticated: true,
      });
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('Amante de los logros')).toBeTruthy());
    });

    it('no muestra el bio cuando es null', async () => {
      const { queryByText } = renderProfile();
      await waitFor(() => expect(queryByText('null')).toBeNull());
    });

    it('muestra el badge Premium para usuarios premium', async () => {
      mockUseSessionStore.mockReturnValue({
        user: { ...baseUser, isPremium: true },
        isAuthenticated: true,
      });
      const { getByLabelText } = renderProfile();
      await waitFor(() => expect(getByLabelText('profile.premium_label')).toBeTruthy());
    });

    it('NO muestra el badge Premium para usuarios free', async () => {
      const { queryByLabelText } = renderProfile();
      await waitFor(() =>
        expect(queryByLabelText('profile.premium_label')).toBeNull(),
      );
    });

    it('muestra la secciÃ³n de plataformas vinculadas', async () => {
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('profile.platforms_section')).toBeTruthy());
    });

    it('muestra las plataformas cuando las hay', async () => {
      const apiGet = jest.fn(() => Promise.resolve([steamAccount]));
      const { getByText } = renderProfile(apiGet);
      await waitFor(() => {
        expect(getByText('Steam')).toBeTruthy();
        expect(getByText('SteamUser99')).toBeTruthy();
      });
    });

    it('muestra el mensaje de plataformas vacÃ­as cuando no hay ninguna', async () => {
      const apiGet = jest.fn(() => Promise.resolve([]));
      const { getByText } = renderProfile(apiGet);
      await waitFor(() =>
        expect(getByText('profile.platforms_empty')).toBeTruthy(),
      );
    });

    it('renderiza el botÃ³n de cerrar sesiÃ³n', async () => {
      const { getByRole } = renderProfile();
      await waitFor(() =>
        expect(getByRole('button', { name: 'profile.logout' })).toBeTruthy(),
      );
    });

    it('muestra el diÃ¡logo de confirmaciÃ³n al pulsar cerrar sesiÃ³n', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const { getByRole } = renderProfile();
      await waitFor(() => getByRole('button', { name: 'profile.logout' }));
      fireEvent.press(getByRole('button', { name: 'profile.logout' }));
      expect(alertSpy).toHaveBeenCalledWith(
        'profile.logout_dialog_title',
        'profile.logout_dialog_message',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('el botÃ³n de cerrar sesiÃ³n estÃ¡ deshabilitado mientras se cierra sesiÃ³n', async () => {
      mockUseAuth.mockReturnValue({ logout: jest.fn(), isLoggingOut: true });
      const { getByRole } = renderProfile();
      await waitFor(() => {
        const button = getByRole('button', { name: 'profile.logout' });
        expect(button.props.accessibilityState?.disabled).toBe(true);
      });
    });

    it('muestra "Cerrando sesiÃ³nâ€¦" cuando isLoggingOut=true', async () => {
      mockUseAuth.mockReturnValue({ logout: jest.fn(), isLoggingOut: true });
      const { getByText } = renderProfile();
      await waitFor(() => expect(getByText('profile.logging_out')).toBeTruthy());
    });

    it('renderiza el enlace a la polÃ­tica de privacidad', async () => {
      const { getByRole } = renderProfile();
      await waitFor(() =>
        expect(getByRole('link', { name: 'privacy.link_label' })).toBeTruthy(),
      );
    });

    it('muestra el badge cuando la cuenta PSN tiene perfil privado', async () => {
      const apiGet = jest.fn(() => Promise.resolve([psnAccountPrivate]));
      const { getByTestId } = renderProfile(apiGet);
      await waitFor(() => expect(getByTestId('psn-private-badge')).toBeTruthy());
    });

    it('NO muestra el badge cuando la cuenta PSN es pública', async () => {
      const apiGet = jest.fn(() => Promise.resolve([psnAccountPublic]));
      const { queryByTestId } = renderProfile(apiGet);
      await waitFor(() => expect(queryByTestId('psn-private-badge')).toBeNull());
    });

    it('NO muestra el badge para cuentas que no son PSN', async () => {
      const apiGet = jest.fn(() => Promise.resolve([steamAccount]));
      const { queryByTestId } = renderProfile(apiGet);
      await waitFor(() => expect(queryByTestId('psn-private-badge')).toBeNull());
    });

    it('tras desvincular exitosamente, invalida my-games y user-stats', async () => {
      const apiGet = jest.fn(() => Promise.resolve([steamAccount]));
      const apiDelete = jest.fn(() =>
        Promise.resolve({ ok: true, deletedAchievements: 12 }),
      );
      const { client, getByRole } = renderProfile(apiGet, apiDelete);
      const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

      // Simular Alert para ejecutar directamente el onPress de confirmación
      jest.spyOn(Alert, 'alert').mockImplementationOnce(
        (_title, _msg, buttons) => {
          const confirmBtn = (
            buttons as { style?: string; onPress?: () => void }[]
          )?.find((b) => b.style === 'destructive');
          confirmBtn?.onPress?.();
        },
      );

      // Esperar a que aparezca el botón de desvincular y pulsarlo
      await waitFor(() =>
        expect(getByRole('button', { name: 'link_platform.steam.unlink' })).toBeTruthy(),
      );
      fireEvent.press(getByRole('button', { name: 'link_platform.steam.unlink' }));

      // Esperar a que se llame api.delete y se invaliden las queries de biblioteca
      await waitFor(() => expect(apiDelete).toHaveBeenCalled());
      await waitFor(() => {
        const keys = invalidateSpy.mock.calls.map(
          (call) => (call[0] as { queryKey?: string[] })?.queryKey?.[0],
        );
        expect(keys).toContain('my-games');
        expect(keys).toContain('user-stats');
      });
    });

    it('BUG-1: tras desvincular exitosamente, llama refetchQueries para sync-summary (no solo invalidateQueries)', async () => {
      // refetchQueries fuerza actualización inmediata de anyPlatformLinked,
      // evitando la race condition donde my-games termina antes que sync-summary.
      const apiGet = jest.fn(() => Promise.resolve([steamAccount]));
      const apiDelete = jest.fn(() =>
        Promise.resolve({ ok: true, deletedAchievements: 12 }),
      );
      const { client, getByRole } = renderProfile(apiGet, apiDelete);
      const refetchSpy = jest.spyOn(client, 'refetchQueries');

      jest.spyOn(Alert, 'alert').mockImplementationOnce(
        (_title, _msg, buttons) => {
          const confirmBtn = (
            buttons as { style?: string; onPress?: () => void }[]
          )?.find((b) => b.style === 'destructive');
          confirmBtn?.onPress?.();
        },
      );

      await waitFor(() =>
        expect(getByRole('button', { name: 'link_platform.steam.unlink' })).toBeTruthy(),
      );
      fireEvent.press(getByRole('button', { name: 'link_platform.steam.unlink' }));

      await waitFor(() => expect(apiDelete).toHaveBeenCalled());
      await waitFor(() => {
        const keys = refetchSpy.mock.calls.map(
          (call) => (call[0] as { queryKey?: string[] })?.queryKey?.[0],
        );
        expect(keys).toContain('sync-summary');
      });
    });

    it('F29: muestra el selector de privacidad de perfil en ajustes', async () => {
      const { getByTestId } = renderProfile();
      await waitFor(() => expect(getByTestId('privacy-selector')).toBeTruthy());
    });

    it('F29: el selector muestra opción PUBLIC como seleccionada por defecto', async () => {
      const { getByTestId } = renderProfile();
      await waitFor(() => {
        const publicBtn = getByTestId('privacy-option-public');
        expect(publicBtn.props.accessibilityState?.selected).toBe(true);
      });
    });

    it('F29: pulsar PRIVATE llama a api.patch con profileVisibility=PRIVATE', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { api } = require('../../lib/api') as { api: { get: jest.Mock; patch: jest.Mock } };
      const patchSpy = jest.fn(() => Promise.resolve({ profileVisibility: 'PRIVATE' }));
      api.patch = patchSpy;

      // getState necesario para que onMutate y onSuccess lean y actualicen el store
      const setUserMock = jest.fn();
      (useSessionStore as unknown as { getState: jest.Mock }).getState = jest.fn().mockReturnValue({
        user: { ...baseUser },
        setUser: setUserMock,
      });

      const apiGet = jest.fn(() => Promise.resolve([]));
      const { getByTestId } = renderProfile(apiGet);
      await waitFor(() => getByTestId('privacy-option-private'));
      fireEvent.press(getByTestId('privacy-option-private'));

      await waitFor(() =>
        expect(patchSpy).toHaveBeenCalledWith(
          '/api/v1/users/me',
          { profileVisibility: 'PRIVATE' },
        ),
      );
    });

    describe('BUG-016: privacyMutation — rollback al fallar la API', () => {
      let setUserMock: jest.Mock;

      beforeEach(() => {
        setUserMock = jest.fn();
        (useSessionStore as unknown as { getState: jest.Mock }).getState = jest.fn().mockReturnValue({
          user: { ...baseUser, profileVisibility: 'PUBLIC' },
          setUser: setUserMock,
        });
      });

      it('(a) rollback: el store restaura la visibilidad anterior cuando la API falla', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { api } = require('../../lib/api') as { api: { get: jest.Mock; patch: jest.Mock } };
        api.patch = jest.fn(() => Promise.reject(new Error('Network error')));
        const { getByTestId } = renderProfile(jest.fn(() => Promise.resolve([])));

        await waitFor(() => getByTestId('privacy-option-private'));
        fireEvent.press(getByTestId('privacy-option-private'));

        // Primera llamada: update optimista → PRIVATE
        // Última llamada: rollback → PUBLIC (visibilidad real del backend)
        await waitFor(() => {
          expect(setUserMock.mock.calls.length).toBeGreaterThanOrEqual(2);
          const lastArg = setUserMock.mock.calls[setUserMock.mock.calls.length - 1]?.[0] as {
            profileVisibility?: string;
          };
          expect(lastArg?.profileVisibility).toBe('PUBLIC');
        });
      });

      it('(b) mensaje de error: Alert informa al usuario de que el cambio no se aplicó', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { api } = require('../../lib/api') as { api: { get: jest.Mock; patch: jest.Mock } };
        api.patch = jest.fn(() => Promise.reject(new Error('Network error')));
        const alertSpy = jest.spyOn(Alert, 'alert');
        const { getByTestId } = renderProfile(jest.fn(() => Promise.resolve([])));

        await waitFor(() => getByTestId('privacy-option-private'));
        fireEvent.press(getByTestId('privacy-option-private'));

        await waitFor(() => {
          const errorCall = alertSpy.mock.calls.find(
            (c) => c[0] === 'profile.privacy_error_title',
          );
          expect(errorCall).toBeDefined();
          expect(errorCall?.[1]).toBe('profile.privacy_error_message');
        });
      });

      it('(c) resincronización: invalida queryKeys.me() para garantizar estado real del backend', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { api } = require('../../lib/api') as { api: { get: jest.Mock; patch: jest.Mock } };
        api.patch = jest.fn(() => Promise.reject(new Error('Network error')));
        const { client, getByTestId } = renderProfile(jest.fn(() => Promise.resolve([])));
        const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

        await waitFor(() => getByTestId('privacy-option-private'));
        fireEvent.press(getByTestId('privacy-option-private'));

        await waitFor(() => {
          const keys = invalidateSpy.mock.calls.map(
            (call) => (call[0] as { queryKey?: string[] })?.queryKey?.[0],
          );
          expect(keys).toContain('me');
        });
      });
    });

    it('F36: muestra la sección de puntos cuando el usuario está autenticado', async () => {
      const { getByTestId } = renderProfile();
      await waitFor(() => expect(getByTestId('points-section')).toBeTruthy());
    });

    it('F36: muestra el saldo de puntos del usuario', async () => {
      const { getByTestId } = renderProfile(undefined, undefined, 150);
      await waitFor(() => {
        const el = getByTestId('points-balance');
        expect(el).toBeTruthy();
      });
    });

    it('F37: muestra el botón "Ver anuncio" para usuarios free', async () => {
      const { getByTestId } = renderProfile();
      await waitFor(() => expect(getByTestId('watch-ad-button')).toBeTruthy());
    });

    it('F37: no muestra el botón "Ver anuncio" para usuarios premium', async () => {
      mockUseSessionStore.mockReturnValue({
        user: { ...baseUser, isPremium: true },
        isAuthenticated: true,
      });
      const { queryByTestId } = renderProfile();
      await waitFor(() => expect(queryByTestId('watch-ad-button')).toBeNull());
    });

    it('F37: el botón "Ver anuncio" está habilitado cuando no hay cooldown activo', async () => {
      const { getByTestId } = renderProfile();
      await waitFor(() => {
        const btn = getByTestId('watch-ad-button');
        expect(btn.props.accessibilityState?.disabled).toBe(false);
      });
    });

    it('F37: el botón "Ver anuncio" está deshabilitado cuando el cooldown está activo', async () => {
      // AsyncStorage devuelve un timestamp reciente → cooldown de 3h activo
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorageMock = require('@react-native-async-storage/async-storage') as {
        getItem: jest.Mock;
      };
      AsyncStorageMock.getItem.mockResolvedValueOnce(String(Date.now() - 1000));

      const { getByTestId } = renderProfile();
      await waitFor(() => {
        const btn = getByTestId('watch-ad-button');
        expect(btn.props.accessibilityState?.disabled).toBe(true);
      });
    });

    it('F37: al ver un anuncio con éxito llama a invalidateQueries en my-points-total', async () => {
      const { client, getByTestId } = renderProfile();
      const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

      await waitFor(() => getByTestId('watch-ad-button'));
      fireEvent.press(getByTestId('watch-ad-button'));

      await waitFor(() => {
        const keys = invalidateSpy.mock.calls.map(
          (call) => (call[0] as { queryKey?: string[] })?.queryKey?.[0],
        );
        expect(keys).toContain('my-points-total');
      });
    });

    it('F37: el botón está deshabilitado cuando !isReady (anuncio aún cargando)', async () => {
      mockUseRewardedAd.mockReturnValue({
        showForReward: jest.fn().mockResolvedValue(null),
        isReady: false,
        adState: 'loading',
        retryLoad: jest.fn(),
      });
      const { getByTestId } = renderProfile();
      await waitFor(() => {
        const btn = getByTestId('watch-ad-button');
        expect(btn.props.accessibilityState?.disabled).toBe(true);
      });
    });

    it('BUG-1: el botón queda habilitado y con texto de reintento cuando adState es "unavailable"', async () => {
      const retryLoad = jest.fn();
      mockUseRewardedAd.mockReturnValue({
        showForReward: jest.fn().mockResolvedValue(null),
        isReady: false,
        adState: 'unavailable',
        retryLoad,
      });
      const { getByTestId } = renderProfile();
      await waitFor(() => {
        const btn = getByTestId('watch-ad-button');
        expect(btn.props.accessibilityState?.disabled).toBe(false);
        expect(btn.props.accessibilityLabel).toBe('profile.points_watch_ad_unavailable');
      });

      fireEvent.press(getByTestId('watch-ad-button'));
      expect(retryLoad).toHaveBeenCalledTimes(1);
    });

    it('F37: cuando showForReward devuelve null (error API) muestra el Alert de error', async () => {
      mockUseRewardedAd.mockReturnValue({
        showForReward: jest.fn().mockResolvedValue(null),
        isReady: true,
        adState: 'ready',
        retryLoad: jest.fn(),
      });
      const alertSpy = jest.spyOn(Alert, 'alert');
      const { getByTestId } = renderProfile();

      await waitFor(() => getByTestId('watch-ad-button'));
      fireEvent.press(getByTestId('watch-ad-button'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'common.error_boundary_title',
          'profile.points_rewarded_error',
        );
      });
    });

    describe('BUG-015: unlinkMutation.onError', () => {
      it('muestra Alert de error cuando api.delete falla al desvincular', async () => {
        const apiGet = jest.fn(() => Promise.resolve([steamAccount]));
        const apiDelete = jest.fn(() => Promise.reject(new Error('Network error')));
        const { getByRole } = renderProfile(apiGet, apiDelete);
        const alertSpy = jest.spyOn(Alert, 'alert');

        // Primera llamada a Alert: diálogo de confirmación — auto-confirmar la acción destructiva
        alertSpy.mockImplementationOnce((_title, _msg, buttons) => {
          const confirmBtn = (buttons as { style?: string; onPress?: () => void }[])
            ?.find((b) => b.style === 'destructive');
          confirmBtn?.onPress?.();
        });

        await waitFor(() =>
          expect(getByRole('button', { name: 'link_platform.steam.unlink' })).toBeTruthy(),
        );
        fireEvent.press(getByRole('button', { name: 'link_platform.steam.unlink' }));

        await waitFor(() => expect(apiDelete).toHaveBeenCalled());

        // Segunda llamada a Alert: feedback de error con título específico
        await waitFor(() => {
          const errorCall = alertSpy.mock.calls.find((c) => c[0] === 'profile.unlink_error_title');
          expect(errorCall).toBeDefined();
          expect(errorCall?.[1]).toBe('profile.unlink_error_message');
        });
      });
    });

    describe('BUG-017: deleteAccountMutation.onError', () => {
      it('muestra Alert con título "cuenta NO eliminada" cuando api.delete falla', async () => {
        // Sin cuentas de plataforma para que api.delete solo se use para deleteAccount
        const apiDelete = jest.fn(() => Promise.reject(new Error('Server error')));
        const { getByRole } = renderProfile(undefined, apiDelete);
        const alertSpy = jest.spyOn(Alert, 'alert');

        // Primera llamada a Alert: diálogo de confirmación — auto-confirmar
        alertSpy.mockImplementationOnce((_title, _msg, buttons) => {
          const confirmBtn = (buttons as { style?: string; onPress?: () => void }[])
            ?.find((b) => b.style === 'destructive');
          confirmBtn?.onPress?.();
        });

        await waitFor(() =>
          expect(getByRole('button', { name: 'profile.delete_account' })).toBeTruthy(),
        );
        fireEvent.press(getByRole('button', { name: 'profile.delete_account' }));

        await waitFor(() => expect(apiDelete).toHaveBeenCalled());

        // El título inequívoco indica que la cuenta NO fue eliminada
        await waitFor(() => {
          const errorCall = alertSpy.mock.calls.find(
            (c) => c[0] === 'profile.delete_account_error_title',
          );
          expect(errorCall).toBeDefined();
          expect(errorCall?.[1]).toBe('profile.delete_account_error');
        });
      });
    });

    describe('bannerMutation', () => {
      const NEW_BANNER_URL = 'https://res.cloudinary.com/new-banner.jpg';

      beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ImagePickerMock = require('expo-image-picker') as {
          requestMediaLibraryPermissionsAsync: jest.Mock;
          launchImageLibraryAsync: jest.Mock;
        };
        ImagePickerMock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
        ImagePickerMock.launchImageLibraryAsync.mockResolvedValue({
          canceled: false,
          assets: [{ uri: 'file:///tmp/banner.jpg' }],
        });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { uploadFile } = require('../../lib/api') as { uploadFile: jest.Mock };
        uploadFile.mockResolvedValue({ banner: NEW_BANNER_URL });
        // getState necesario para que onSuccess pueda actualizar el store sin lanzar
        (useSessionStore as unknown as { getState: jest.Mock }).getState = jest.fn().mockReturnValue({
          user: baseUser,
          setUser: jest.fn(),
        });
      });

      it('T74: onSuccess invalida queryKeys.me() igual que avatarMutation', async () => {
        const { client, getByLabelText } = renderProfile();
        const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

        await waitFor(() => getByLabelText('profile.change_banner'));
        fireEvent.press(getByLabelText('profile.change_banner'));

        await waitFor(() => {
          const invalidatedKeys = invalidateSpy.mock.calls.map(
            (call) => (call[0] as { queryKey?: string[] })?.queryKey?.[0],
          );
          expect(invalidatedKeys).toContain('me');
        });
      });

      it('T74: onSuccess actualiza el store de Zustand con la URL del banner devuelta por el servidor', async () => {
        const setUserMock = jest.fn();
        // Sobreescribir el getState del beforeEach con un setUser espía
        (useSessionStore as unknown as { getState: jest.Mock }).getState = jest.fn().mockReturnValue({
          user: { ...baseUser, banner: 'https://old.banner.jpg' },
          setUser: setUserMock,
        });

        const { getByLabelText } = renderProfile();

        await waitFor(() => getByLabelText('profile.change_banner'));
        fireEvent.press(getByLabelText('profile.change_banner'));

        await waitFor(() => {
          expect(setUserMock).toHaveBeenCalledWith(
            expect.objectContaining({ banner: NEW_BANNER_URL }),
          );
        });
      });
    });
  });
});

