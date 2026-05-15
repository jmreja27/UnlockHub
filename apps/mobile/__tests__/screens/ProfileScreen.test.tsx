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
  createdAt: '2024-01-01T00:00:00.000Z',
};

const steamAccount: PlatformAccount = {
  id: 'pa-1',
  userId: 'u1',
  platform: 'STEAM',
  externalId: 'steam123',
  username: 'SteamUser99',
  lastSyncedAt: null,
};

function renderProfile(mockApiGet?: jest.Mock) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { api } = require('../../lib/api') as { api: { get: jest.Mock } };
  api.get = mockApiGet ?? jest.fn(() => Promise.resolve([]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
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
  });
});

