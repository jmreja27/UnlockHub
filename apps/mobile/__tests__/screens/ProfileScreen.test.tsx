import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, PlatformAccount } from '@unlockhub/types';

import ProfileScreen from '../../app/(tabs)/profile';
import { useSessionStore } from '../../stores/sessionStore';
import { useAuth } from '../../hooks/useAuth';

jest.mock('../../stores/sessionStore');
jest.mock('../../hooks/useAuth');
jest.mock('../../hooks/useFeed', () => ({
  useFeed: () => ({ events: [], isLoading: false, isError: false, refetch: jest.fn() }),
}));
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

function renderProfile(mockApiGet?: jest.Mock, mockApiDelete?: jest.Mock) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { api } = require('../../lib/api') as { api: { get: jest.Mock; delete: jest.Mock } };
  api.get = mockApiGet ?? jest.fn(() => Promise.resolve([]));
  api.delete = mockApiDelete ?? jest.fn(() => Promise.resolve({ ok: true, deletedAchievements: 0 }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
      // toLocaleString() puede devolver '1,500' o '1500' segÃºn el entorno Node.js
      const formattedXp = (1500).toLocaleString();
      await waitFor(() => expect(getByText(formattedXp)).toBeTruthy());
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
  });
});

