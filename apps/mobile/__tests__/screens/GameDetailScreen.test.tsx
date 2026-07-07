import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import GameDetailScreen from '../../app/game/[id]';
import { useGameDetail, useMyGameAchievements } from '../../hooks/useSearch';
import { useSessionStore } from '../../stores/sessionStore';
import { useFriends } from '../../hooks/useFriends';
import { api } from '../../lib/api';

jest.mock('../../hooks/useSearch');
jest.mock('../../stores/sessionStore');
jest.mock('../../hooks/useFriends');
jest.mock('../../lib/api');
jest.mock('../../lib/analytics');
jest.mock('../../components/SkeletonBox', () => ({ SkeletonBox: () => null }));

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn().mockReturnValue(true) };
  return {
    router: mockRouter,
    useLocalSearchParams: jest.fn(() => ({ id: 'game-shell-1' })),
    useRouter: jest.fn(() => mockRouter),
    Stack: { Screen: () => null },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

const mockUseGameDetail = useGameDetail as jest.Mock;
const mockUseMyGameAchievements = useMyGameAchievements as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseFriends = useFriends as jest.Mock;
const mockApiPost = api.post as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const shellGame = {
  id: 'game-shell-1',
  platform: 'STEAM',
  title: 'Portal',
  console: null,
  iconUrl: null,
  headerUrl: null,
  totalAchievements: 0,
  achievements: [],
};

const gameWithAchievements = {
  ...shellGame,
  totalAchievements: 2,
  achievements: [
    { id: 'a1', title: 'First Steps', description: null, iconUrl: null, normalizedPoints: 10, rarity: 50 },
    { id: 'a2', title: 'Winner', description: 'Win a match', iconUrl: null, normalizedPoints: 50, rarity: 5 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFriends.mockReturnValue({ friends: [] });
  mockUseMyGameAchievements.mockReturnValue({ data: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

// ── T127/T129: el botón "Retar" muestra el alert "próximamente" y no abre el modal ──

describe('GameDetailScreen — retar a un amigo (gateado, T129)', () => {
  const friendUserId = 'friend-user-id-0001';

  const acceptedFriendship = {
    id: 'friendship-1',
    senderId: 'user-1',
    receiverId: friendUserId,
    status: 'ACCEPTED' as const,
    createdAt: '2025-01-01T00:00:00Z',
    sender: { id: 'user-1', username: 'me', avatar: null, level: 1, xp: 0 },
    receiver: { id: friendUserId, username: 'alice', avatar: null, level: 1, xp: 0 },
  };

  it('muestra el Alert "próximamente" al pulsar Retar y no llama al endpoint de challenge', () => {
    mockUseGameDetail.mockReturnValue({ data: gameWithAchievements, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });
    mockUseFriends.mockReturnValue({ friends: [acceptedFriendship] });

    const { getAllByLabelText, queryByText } = renderWithClient(<GameDetailScreen />);

    const challengeButtons = getAllByLabelText('game.challenge_friend_label');
    fireEvent.press(challengeButtons[0]);

    expect(Alert.alert).toHaveBeenCalledWith('game.challenge_coming_soon');
    expect(mockApiPost).not.toHaveBeenCalled();
    // El modal de selección de amigo no se abre
    expect(queryByText('game.challenge_select_friend')).toBeNull();
  });

  it('renderiza el botón Retar con el texto corto en lugar del icono de diana', () => {
    mockUseGameDetail.mockReturnValue({ data: gameWithAchievements, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });
    mockUseFriends.mockReturnValue({ friends: [acceptedFriendship] });

    const { getAllByText } = renderWithClient(<GameDetailScreen />);

    expect(getAllByText('game.challenge_button').length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GameDetailScreen — juego con 0 logros (shell game)', () => {
  it('muestra el botón "Cargar logros" cuando totalAchievements === 0 y el usuario está autenticado', () => {
    mockUseGameDetail.mockReturnValue({ data: shellGame, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });

    const { getByTestId } = renderWithClient(<GameDetailScreen />);

    expect(getByTestId('fetch-achievements-button')).toBeTruthy();
  });

  it('NO muestra el botón cuando el usuario no está autenticado', () => {
    mockUseGameDetail.mockReturnValue({ data: shellGame, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: null, isAuthenticated: false });

    const { queryByTestId } = renderWithClient(<GameDetailScreen />);

    expect(queryByTestId('fetch-achievements-button')).toBeNull();
  });

  it('NO muestra el botón cuando el juego tiene logros', () => {
    mockUseGameDetail.mockReturnValue({ data: gameWithAchievements, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });

    const { queryByTestId } = renderWithClient(<GameDetailScreen />);

    expect(queryByTestId('fetch-achievements-button')).toBeNull();
  });

  it('llama a POST /api/v1/games/:id/fetch-achievements al pulsar el botón', async () => {
    mockUseGameDetail.mockReturnValue({ data: shellGame, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });
    mockApiPost.mockResolvedValue({ achievementsAdded: 10 });

    const { getByTestId } = renderWithClient(<GameDetailScreen />);

    fireEvent.press(getByTestId('fetch-achievements-button'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/games/game-shell-1/fetch-achievements',
      );
    });
  });
});

// ── BUG-009: guard canGoBack en botón Volver ──────────────────────────────────

describe('GameDetailScreen — guard canGoBack (BUG-009)', () => {
  it('presionar Volver con historial llama router.back()', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    mockUseGameDetail.mockReturnValue({ data: shellGame, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });

    const { getByLabelText } = renderWithClient(<GameDetailScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('presionar Volver sin historial navega a /(tabs)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    mockUseGameDetail.mockReturnValue({ data: shellGame, isLoading: false, isError: false });
    mockUseSessionStore.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });

    const { getByLabelText } = renderWithClient(<GameDetailScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });
});
