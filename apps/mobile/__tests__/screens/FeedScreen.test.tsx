import React from 'react';
import { FlatList } from 'react-native';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
jest.mock('../../components/SyncStatusBar', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SyncStatusBar: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { View } = require('react-native');
    return <View testID="sync-status-bar" />;
  },
}));
jest.mock('../../components/NewGamesBanner', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NewGamesBanner: ({ onPress }: { count: number; onPress: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID="new-games-banner" onPress={onPress}>
        <Text>new-games-banner</Text>
      </Pressable>
    );
  },
}));

const mockUseMyGames = useMyGames as jest.Mock;
const mockUseSyncAll = useSyncAll as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  const rerender = (newUi: React.ReactElement) =>
    result.rerender(<QueryClientProvider client={queryClient}>{newUi}</QueryClientProvider>);
  return { ...result, rerender };
}

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
    lastActivityAt: null,
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
    lastActivityAt: null,
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
    const { getByRole } = renderWithClient(<LibraryScreen />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('no muestra el estado de error mientras carga', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isLoading: true });
    const { queryByRole } = renderWithClient(<LibraryScreen />);
    expect(queryByRole('alert')).toBeNull();
  });

  it('muestra el estado de error cuando falla la carga', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByRole } = renderWithClient(<LibraryScreen />);
    expect(getByRole('alert')).toBeTruthy();
  });

  it('muestra el título del error en el estado de error', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByText } = renderWithClient(<LibraryScreen />);
    expect(getByText('library.error_title')).toBeTruthy();
  });

  it('muestra el mensaje de error secundario', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, isError: true });
    const { getByText } = renderWithClient(<LibraryScreen />);
    expect(getByText('library.error_message')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay juegos', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [] });
    const { getByText } = renderWithClient(<LibraryScreen />);
    expect(getByText('library.empty_title')).toBeTruthy();
  });

  it('renderiza las tarjetas de juegos cuando hay datos', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { getAllByRole } = renderWithClient(<LibraryScreen />);
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(sampleGames.length);
  });

  it('el pull-to-refresh no lanza error al activarse', async () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);
    // handleRefresh es async — envolver en act para gestionar correctamente las actualizaciones de estado
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    // Si llegamos aquí sin error, el test pasa
  });

  it('el onEndReached y onRefresh son callbacks distintos en el FlashList', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames, hasNextPage: true });
    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);
    expect(list.props.onEndReached).toBeDefined();
    expect(list.props.refreshControl.props.onRefresh).toBeDefined();
    // Son funciones distintas — el infinite scroll no activa el pull-to-refresh
    expect(list.props.onEndReached).not.toBe(list.props.refreshControl.props.onRefresh);
  });

  it('el RefreshControl tiene refreshing=false inicialmente (no ligado a isFetchingNextPage)', () => {
    // isFetchingNextPage=true no debe hacer que refreshing sea true en el RefreshControl
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames, isFetchingNextPage: true });
    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);
    expect(list.props.refreshControl.props.refreshing).toBe(false);
  });

  it('muestra el SyncStatusBar cuando totalGames > 0', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames, totalGames: 2 });
    const { getByTestId } = renderWithClient(<LibraryScreen />);
    expect(getByTestId('sync-status-bar')).toBeTruthy();
  });

  it('no muestra el SyncStatusBar cuando totalGames === 0', () => {
    mockUseMyGames.mockReturnValue(baseMyGamesResult);
    const { queryByTestId } = renderWithClient(<LibraryScreen />);
    expect(queryByTestId('sync-status-bar')).toBeNull();
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
    const { getByText } = renderWithClient(<LibraryScreen />);
    // accessibilityElementsHidden oculta los Text del árbol de a11y — includeHiddenElements necesario
    expect(getByText('3/10', { includeHiddenElements: true })).toBeTruthy();
    expect(getByText('library.games_short', { includeHiddenElements: true })).toBeTruthy();
  });

  it('no muestra el contador de juegos cuando totalGames es 0', () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, totalGames: 0, totalCompletedGames: 0 });
    const { queryByText } = renderWithClient(<LibraryScreen />);
    expect(queryByText('library.games_short', { includeHiddenElements: true })).toBeNull();
  });

  // ── Tests del banner "X juegos nuevos" ───────────────────────────────────────

  it('banner NO aparece cuando isRunning=false aunque cambien los juegos', () => {
    const mockSyncProgress = jest.requireMock('../../hooks/useSyncProgress');
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: false });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { queryByTestId } = renderWithClient(<LibraryScreen />);
    expect(queryByTestId('new-games-banner')).toBeNull();
  });

  it('banner NO aparece en la carga inicial (seenGamesCount se inicializa al mismo count)', async () => {
    const mockSyncProgress = jest.requireMock('../../hooks/useSyncProgress');
    // Sync activo desde el inicio — seenGamesCount aún es 0, no debe mostrarse
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: true });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { queryByTestId } = renderWithClient(<LibraryScreen />);
    // Después de la inicialización (useEffect), seenGamesCount = sampleGames.length = allGames.length
    // así que no hay juegos "nuevos" todavía
    expect(queryByTestId('new-games-banner')).toBeNull();
  });

  it('banner SÍ aparece cuando isRunning=true y llegan juegos nuevos tras la inicialización', async () => {
    const mockSyncProgress = jest.requireMock('../../hooks/useSyncProgress');

    // Estado inicial: sin sync, 2 juegos — seenGamesCount se inicializa a 2
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: false });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { rerender, queryByTestId } = renderWithClient(<LibraryScreen />);
    expect(queryByTestId('new-games-banner')).toBeNull();

    // Sync activo + 1 juego nuevo llegó (3 > 2 → banner)
    const extraGame: LibraryGame = {
      id: 'g3',
      title: 'Elden Ring',
      platform: 'STEAM',
      iconUrl: null,
      totalAchievements: 42,
      earnedAchievements: 0,
      completionPct: 0,
      lastSyncedAt: null,
      lastActivityAt: null,
      hasPlatinum: false,
      platinumEarned: false,
      isCompleted: false,
    };
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: true });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [...sampleGames, extraGame] });

    await act(async () => {
      rerender(<LibraryScreen />);
    });

    expect(queryByTestId('new-games-banner')).not.toBeNull();
  });

  it('banner desaparece al hacer pull-to-refresh', async () => {
    const mockSyncProgress = jest.requireMock('../../hooks/useSyncProgress');

    // Estado con sync activo y juegos nuevos para que el banner esté visible
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: false });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { rerender, queryByTestId, UNSAFE_getByType } = renderWithClient(<LibraryScreen />);

    // Activar sync con juego nuevo
    const extraGame: LibraryGame = {
      id: 'g3',
      title: 'Celeste',
      platform: 'STEAM',
      iconUrl: null,
      totalAchievements: 30,
      earnedAchievements: 0,
      completionPct: 0,
      lastSyncedAt: null,
      lastActivityAt: null,
      hasPlatinum: false,
      platinumEarned: false,
      isCompleted: false,
    };
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: true });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [...sampleGames, extraGame] });

    await act(async () => {
      rerender(<LibraryScreen />);
    });

    expect(queryByTestId('new-games-banner')).not.toBeNull();

    // Pull-to-refresh oculta el banner
    const list = UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });

    expect(queryByTestId('new-games-banner')).toBeNull();
  });

  // ── Tests de sort con carga completa de páginas ──────────────────────────────

  it('al cambiar el sort con hasNextPage=true, llama fetchNextPage', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });
    const { getByRole } = renderWithClient(<LibraryScreen />);

    // Pulsar el botón de sort para abrir el modal
    const sortButton = getByRole('button', { name: /library\.sort_button_a11y/ });
    fireEvent.press(sortButton);

    // Seleccionar una opción de sort distinta al default
    await waitFor(() => expect(getByRole('radio', { name: 'library.sort_pct_desc' })).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByRole('radio', { name: 'library.sort_pct_desc' }));
    });

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('al cambiar el sort con hasNextPage=false, NO llama fetchNextPage', async () => {
    const mockFetchNextPage = jest.fn();
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      hasNextPage: false,
      fetchNextPage: mockFetchNextPage,
    });
    const { getByRole } = renderWithClient(<LibraryScreen />);

    const sortButton = getByRole('button', { name: /library\.sort_button_a11y/ });
    fireEvent.press(sortButton);

    await waitFor(() => expect(getByRole('radio', { name: 'library.sort_alpha_asc' })).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByRole('radio', { name: 'library.sort_alpha_asc' }));
    });

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });

  it('el botón de sort muestra ActivityIndicator cuando isFetchingNextPage=true', () => {
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      isFetchingNextPage: true,
    });
    const { getByTestId } = renderWithClient(<LibraryScreen />);
    expect(getByTestId('sort-loading-indicator')).toBeTruthy();
  });
});
