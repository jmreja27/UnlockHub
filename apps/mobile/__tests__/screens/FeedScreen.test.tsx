import React from 'react';
import { FlatList } from 'react-native';
import { render } from '@testing-library/react-native';

import LibraryScreen from '../../app/(tabs)/index';
import { useMyGames } from '../../hooks/useMyGames';
import { useSyncAll } from '../../hooks/useSyncAll';
import { useSessionStore } from '../../stores/sessionStore';
import type { LibraryGame } from '../../hooks/useMyGames';

jest.mock('../../hooks/useMyGames');
jest.mock('../../hooks/useSyncAll');
jest.mock('../../hooks/useSyncProgress', () => ({
  useSyncProgress: jest.fn().mockReturnValue({
    activeSyncs: new Map(),
    isRunning: false,
  }),
}));
jest.mock('../../stores/sessionStore');
jest.mock('../../components/AdBanner', () => ({ AdBanner: () => null }));
jest.mock('../../components/LibraryGameCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LibraryGameCard: ({ game }: { game: LibraryGame }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text accessibilityRole="button">{game.title}</Text>;
  },
}));
jest.mock('../../components/SkeletonBox', () => ({
  SkeletonBox: () => null,
}));
jest.mock('../../components/EmptyState', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  EmptyState: ({ title }: { title: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

const mockUseMyGames = useMyGames as jest.Mock;
const mockUseSyncAll = useSyncAll as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

const baseMyGamesResult = {
  allGames: [],
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  isRefetching: false,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  dataUpdatedAt: 0,
  total: 0,
  totalEarnedAchievements: 0,
  totalAvailableAchievements: 0,
  totalGames: 0,
  totalCompletedGames: 0,
};

const baseSyncResult = {
  sync: jest.fn(),
  isSyncing: false,
  isInCooldown: false,
  cooldownRemaining: 0,
  hasPlatforms: false,
};

const sampleGames: LibraryGame[] = [
  {
    id: 'g1',
    title: 'Portal 2',
    platform: 'STEAM',
    iconUrl: null,
    totalAchievements: 10,
    earnedAchievements: 5,
    completionPct: 50,
    lastSyncedAt: null,
    hasPlatinum: false,
    platinumEarned: false,
    isCompleted: false,
  },
  {
    id: 'g2',
    title: 'Hollow Knight',
    platform: 'STEAM',
    iconUrl: null,
    totalAchievements: 63,
    earnedAchievements: 20,
    completionPct: 31,
    lastSyncedAt: null,
    hasPlatinum: false,
    platinumEarned: false,
    isCompleted: false,
  },
];

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSessionStore.mockReturnValue({ user: { id: 'u1', username: 'jugador1', isPremium: false } });
    mockUseSyncAll.mockReturnValue(baseSyncResult);
  });

  it('renderiza el título de la biblioteca', () => {
    mockUseMyGames.mockReturnValue(baseMyGamesResult);
    const { getByRole } = render(<LibraryScreen />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('no muestra el estado de error mientras carga', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isLoading: true });
    const { queryByRole } = render(<LibraryScreen />);
    expect(queryByRole('alert')).toBeNull();
  });

  it('muestra el estado de error cuando falla la carga', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByRole } = render(<LibraryScreen />);
    expect(getByRole('alert')).toBeTruthy();
  });

  it('muestra el título del error en el estado de error', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('library.error_title')).toBeTruthy();
  });

  it('muestra el mensaje de error secundario', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('library.error_message')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay juegos', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [] });
    const { getByText } = render(<LibraryScreen />);
    expect(getByText('library.empty_title')).toBeTruthy();
  });

  it('renderiza las tarjetas de juegos cuando hay datos', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { getAllByRole } = render(<LibraryScreen />);
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(sampleGames.length);
  });

  it('el pull-to-refresh llama a refetch', () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames, refetch });
    const { UNSAFE_getByType } = render(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);
    list.props.refreshControl.props.onRefresh();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('muestra el botón de sync cuando hay plataformas vinculadas', () => {
    mockUseMyGames.mockReturnValue(baseMyGamesResult);
    mockUseSyncAll.mockReturnValue({ ...baseSyncResult, hasPlatforms: true });
    const { getByRole } = render(<LibraryScreen />);
    expect(getByRole('button', { name: 'library.sync_button' })).toBeTruthy();
  });

  it('muestra el contador de juegos completados/totales cuando hay juegos', () => {
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      totalGames: 10,
      totalCompletedGames: 3,
      totalEarnedAchievements: 25,
      totalAvailableAchievements: 73,
    });
    const { getByText } = render(<LibraryScreen />);
    // accessibilityElementsHidden oculta los Text del árbol de a11y — includeHiddenElements necesario
    expect(getByText('3/10', { includeHiddenElements: true })).toBeTruthy();
    expect(getByText('library.games_short', { includeHiddenElements: true })).toBeTruthy();
  });

  it('no muestra el contador de juegos cuando totalGames es 0', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, totalGames: 0, totalCompletedGames: 0 });
    const { queryByText } = render(<LibraryScreen />);
    expect(queryByText('library.games_short', { includeHiddenElements: true })).toBeNull();
  });
});
