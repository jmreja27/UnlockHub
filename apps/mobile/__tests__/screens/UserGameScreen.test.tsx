import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UserGameScreen from '../../app/user-game/[username]/[gameId]';
import { useUserGameAchievements } from '../../hooks/useUserGames';
import { useSessionStore } from '../../stores/sessionStore';

jest.mock('../../hooks/useUserGames');
jest.mock('../../stores/sessionStore');
jest.mock('../../components/SkeletonBox', () => ({ SkeletonBox: () => null }));
jest.mock('../../lib/platformColors', () => ({
  getPlatformColor: jest.fn(() => '#6366f1'),
}));

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    router: mockRouter,
    useLocalSearchParams: jest.fn(() => ({ username: 'targetUser', gameId: 'game-1' })),
    useRouter: jest.fn(() => mockRouter),
    Stack: { Screen: () => null },
  };
});

const mockUseUserGameAchievements = useUserGameAchievements as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

const sampleData = {
  game: {
    id: 'game-1',
    title: 'Portal',
    iconUrl: null,
    platform: 'STEAM',
    totalAchievements: 2,
    earnedAchievements: 1,
    completionPct: 50,
  },
  achievements: [
    {
      id: 'ach-1',
      title: 'Logro A',
      description: 'Descripción A',
      iconUrl: null,
      rarity: 0.5,
      normalizedPoints: 50,
      platform: 'STEAM',
      externalId: 'A',
      externalUrl: null,
      isUnlocked: true,
      unlockedAt: '2024-01-01T00:00:00.000Z',
      isUnlockedByMe: false,
    },
    {
      id: 'ach-2',
      title: 'Logro B',
      description: null,
      iconUrl: null,
      rarity: 0.9,
      normalizedPoints: 10,
      platform: 'STEAM',
      externalId: 'B',
      externalUrl: null,
      isUnlocked: false,
      unlockedAt: null,
      isUnlockedByMe: null,
    },
  ],
  earnedCount: 1,
  totalCount: 2,
};

interface MockState {
  isAuthenticated: boolean;
  user: { id: string; username: string; isPremium: boolean } | null;
}

function setupStore(state: Partial<MockState> = {}) {
  const fullState: MockState = { isAuthenticated: true, user: { id: 'u1', username: 'me', isPremium: false }, ...state };
  mockUseSessionStore.mockImplementation((selector: ((s: MockState) => unknown) | undefined) =>
    typeof selector === 'function' ? selector(fullState) : fullState,
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('UserGameScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  it('muestra skeleton durante la carga', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { queryByText } = renderWithClient(<UserGameScreen />);
    expect(queryByText('Portal')).toBeNull();
  });

  it('muestra error genérico cuando la query falla', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { getByText } = renderWithClient(<UserGameScreen />);
    expect(getByText('common.error_generic')).toBeTruthy();
  });

  it('muestra el título del juego cuando hay datos', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: sampleData, isLoading: false, isError: false });
    const { getByText } = renderWithClient(<UserGameScreen />);
    expect(getByText('Portal')).toBeTruthy();
  });

  it('muestra el título del logro desbloqueado en modo "Sus logros"', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: sampleData, isLoading: false, isError: false });
    const { getByText } = renderWithClient(<UserGameScreen />);
    expect(getByText('Logro A')).toBeTruthy();
    expect(getByText('Logro B')).toBeTruthy();
  });

  it('muestra tabs de toggle cuando el usuario está autenticado', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: sampleData, isLoading: false, isError: false });
    const { getByTestId } = renderWithClient(<UserGameScreen />);
    expect(getByTestId('tab-their')).toBeTruthy();
    expect(getByTestId('tab-compare')).toBeTruthy();
  });

  it('NO muestra tabs de toggle cuando el usuario no está autenticado', () => {
    setupStore({ isAuthenticated: false, user: null });
    mockUseUserGameAchievements.mockReturnValue({ data: sampleData, isLoading: false, isError: false });
    const { queryByTestId } = renderWithClient(<UserGameScreen />);
    expect(queryByTestId('tab-their')).toBeNull();
    expect(queryByTestId('tab-compare')).toBeNull();
  });

  it('muestra el porcentaje de completado en el header', () => {
    mockUseUserGameAchievements.mockReturnValue({ data: sampleData, isLoading: false, isError: false });
    const { getByText } = renderWithClient(<UserGameScreen />);
    // "1/2 logros · 50%"
    expect(getByText(/50%/)).toBeTruthy();
  });
});
