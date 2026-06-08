import React from 'react';
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
jest.mock('../../components/SkeletonBox', () => ({ SkeletonBox: () => null }));

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
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
});

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
