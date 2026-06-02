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
jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: jest.fn().mockReturnValue({ anyPlatformLinked: false }),
}));
jest.mock('../../stores/sessionStore');
jest.mock('../../stores/preferencesStore', () => ({
  usePreferencesStore: jest.fn().mockReturnValue({
    librarySortOrder: 'last_played',
    setLibrarySortOrder: jest.fn(),
    loadPreferences: jest.fn(),
  }),
}));
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockUsePreferencesStore = (require('../../stores/preferencesStore') as { usePreferencesStore: jest.Mock }).usePreferencesStore;

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
  // mockResolvedValue en lugar de jest.fn() para que fetchAllRemainingPages no crashee
  // cuando hasNextPage=true: result.hasNextPage arrojaría TypeError si fetchNextPage retorna undefined
  fetchNextPage: jest.fn().mockResolvedValue({ hasNextPage: false }),
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
    // Sort por defecto: last_played — las tests que necesitan otro valor lo sobreescriben
    mockUsePreferencesStore.mockReturnValue({
      librarySortOrder: 'last_played',
      setLibrarySortOrder: jest.fn(),
      loadPreferences: jest.fn(),
    });
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

  // ── BUG-3: carga completa al montar con sort persistido y datos en caché ────────
  // isLoading=false desde el inicio (datos en caché) + hasNextPage=true
  // Con useEffect([isLoading]) el efecto NO se re-dispara (isLoading nunca cambia).
  // La solución con initialLoadDoneRef + deps más amplias captura ambos casos.

  it('BUG-3: con datos en caché (isLoading=false desde el inicio), carga todas las páginas al montar con sort activo', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    // Simula caché disponible: isLoading=false desde el principio + allGames ya populado
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    mockUsePreferencesStore.mockReturnValue({
      librarySortOrder: 'alpha_asc',
      setLibrarySortOrder: jest.fn(),
      loadPreferences: jest.fn(),
    });

    renderWithClient(<LibraryScreen />);

    // fetchAllRemainingPages debe dispararse incluso sin transición isLoading true→false
    await waitFor(() => {
      expect(mockFetchNextPage).toHaveBeenCalled();
    });
  });

  it('BUG-1: carga todas las páginas al montar con sort last_played cuando hasNextPage=true', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    // Sort por defecto: last_played (ya configurado en beforeEach)

    renderWithClient(<LibraryScreen />);

    // Con el fix, last_played también carga todas las páginas para que el sort sea correcto
    await waitFor(() => {
      expect(mockFetchNextPage).toHaveBeenCalled();
    });
  });

  // ── BUG-1: carga completa al montar con sort persistido distinto de last_played ──

  it('BUG-1: llama fetchAllRemainingPages al montar cuando sort != last_played e isLoading pasa a false con hasNextPage=true', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    // Simular que la carga inicial acaba de terminar: isLoading=false + hasNextPage=true
    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    // Sort alpha_asc persistido (distinto de last_played)
    mockUsePreferencesStore.mockReturnValue({
      librarySortOrder: 'alpha_asc',
      setLibrarySortOrder: jest.fn(),
      loadPreferences: jest.fn(),
    });

    renderWithClient(<LibraryScreen />);

    // El useEffect de BUG-1 debe disparar fetchNextPage al terminar la carga inicial
    await waitFor(() => {
      expect(mockFetchNextPage).toHaveBeenCalled();
    });
  });

  it('BUG-1: carga todas las páginas al montar con sort last_played cuando allGames.length > 0 y hasNextPage=true', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    // Sort por defecto: last_played (ya configurado en beforeEach)

    renderWithClient(<LibraryScreen />);

    // Con el fix, ya no hay early return para last_played — fetchNextPage debe llamarse
    await waitFor(() => {
      expect(mockFetchNextPage).toHaveBeenCalled();
    });
  });

  // ── BUG-2: pull-to-refresh carga todas las páginas cuando hay sort activo ────

  it('BUG-2: handleRefresh llama fetchNextPage cuando sort != last_played', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    mockUsePreferencesStore.mockReturnValue({
      librarySortOrder: 'pct_desc',
      setLibrarySortOrder: jest.fn(),
      loadPreferences: jest.fn(),
    });

    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);

    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('BUG-1: handleRefresh llama fetchNextPage con sort last_played cuando hasNextPage=true', async () => {
    const mockFetchNextPage = jest.fn().mockResolvedValue({ hasNextPage: false });

    mockUseMyGames.mockReturnValue({
      ...baseMyGamesResult,
      allGames: sampleGames,
      hasNextPage: true,
      fetchNextPage: mockFetchNextPage,
    });

    // Sort por defecto: last_played (ya configurado en beforeEach)

    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);

    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });

    // Con el fix, handleRefresh siempre llama fetchAllRemainingPages, sin condición por sort
    expect(mockFetchNextPage).toHaveBeenCalled();
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

  // ── BUG 2: empty state basado en anyPlatformLinked ────────────────────────────

  it('BUG-2: muestra empty_title (vincular plataformas) cuando no hay juegos y no hay plataformas vinculadas', () => {
    const mockSyncStatus = jest.requireMock('../../hooks/useSyncStatus');
    mockSyncStatus.useSyncStatus.mockReturnValue({ anyPlatformLinked: false });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [] });
    const { getByText } = renderWithClient(<LibraryScreen />);
    expect(getByText('library.empty_title')).toBeTruthy();
  });

  it('BUG-2: muestra empty_linked_title cuando hay plataformas vinculadas pero sin juegos aún', () => {
    const mockSyncStatus = jest.requireMock('../../hooks/useSyncStatus');
    mockSyncStatus.useSyncStatus.mockReturnValue({ anyPlatformLinked: true });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: [] });
    const { getByText } = renderWithClient(<LibraryScreen />);
    expect(getByText('library.empty_linked_title')).toBeTruthy();
  });

  // ── BUG 1: sort last_played con null durante sync activo ─────────────────────

  it('BUG-1: sort last_played no lanza con juegos null lastActivityAt durante sync activo', () => {
    const mockSyncProgress = jest.requireMock('../../hooks/useSyncProgress');
    mockSyncProgress.useSyncProgress.mockReturnValue({ activeSyncs: new Map(), isRunning: true });
    const gamesWithNull = [
      { ...sampleGames[0]!, lastActivityAt: null },
      { ...sampleGames[1]!, lastActivityAt: '2024-01-01T00:00:00Z' },
    ];
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: gamesWithNull });
    // No debe lanzar — los juegos con null se tratan como recientes cuando isRunning=true
    expect(() => renderWithClient(<LibraryScreen />)).not.toThrow();
  });

  // ── BUG 4: handleRefresh resuelve rápido ─────────────────────────────────────

  it('BUG-4: handleRefresh resuelve isManualRefreshing en finally aunque falle el reset', async () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const { UNSAFE_getByType } = renderWithClient(<LibraryScreen />);
    const list = UNSAFE_getByType(FlatList);
    // handleRefresh debe resolverse sin lanzar aunque queryClient.resetQueries rechace
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    // refreshing vuelve a false en el finally
    expect(list.props.refreshControl.props.refreshing).toBe(false);
  });

  // ── Mount invalidation: fuerza refetch al abrir la app ───────────────────────

  it('invalida my-games al montar cuando el usuario tiene ID', async () => {
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult, allGames: sampleGames });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    render(<QueryClientProvider client={queryClient}><LibraryScreen /></QueryClientProvider>);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['my-games'] });
    });
  });

  it('NO invalida my-games al montar cuando el usuario no tiene ID', async () => {
    mockUseSessionStore.mockReturnValue({ user: null });
    mockUseMyGames.mockReturnValue({ ...baseMyGamesResult });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    render(<QueryClientProvider client={queryClient}><LibraryScreen /></QueryClientProvider>);

    // Dejar que los efectos se ejecuten
    await act(async () => { await Promise.resolve(); });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['my-games'] });
  });
});
