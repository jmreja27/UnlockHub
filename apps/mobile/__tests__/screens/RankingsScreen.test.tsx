import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RankingEntry } from '@unlockhub/types';

import RankingsScreen from '../../app/(tabs)/rankings';
import { useGlobalRankings, useMyRanking } from '../../hooks/useRankings';
import { useSessionStore } from '../../stores/sessionStore';

jest.mock('../../hooks/useRankings');
jest.mock('../../stores/sessionStore');
jest.mock('../../components/AdBanner', () => ({ AdBanner: () => null }));

const mockUseGlobalRankings = useGlobalRankings as jest.Mock;
const mockUseMyRanking = useMyRanking as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const sampleEntries: RankingEntry[] = [
  { userId: 'u1', username: 'campeon', avatar: null, xp: 9000, rank: 1, countryCode: 'ES' },
  { userId: 'u2', username: 'segundo', avatar: null, xp: 7500, rank: 2, countryCode: null },
  { userId: 'u3', username: 'tercero', avatar: null, xp: 6000, rank: 3, countryCode: 'MX' },
];

function setupMocks(
  entries: RankingEntry[] = [],
  isLoading = false,
  isError = false,
  myRanking: { rank: number | null; xp: number } | null = null,
  currentUserId: string | null = null,
  isRefetching = false,
) {
  mockUseGlobalRankings.mockReturnValue({
    data: entries.length > 0 ? { data: entries, total: entries.length } : undefined,
    isLoading,
    isError,
    refetch: jest.fn(),
    isRefetching,
  });
  mockUseMyRanking.mockReturnValue({ data: myRanking });
  mockUseSessionStore.mockReturnValue({
    user: currentUserId ? { id: currentUserId, isPremium: false } : null,
  });
}

describe('RankingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza el titulo', () => {
    setupMocks();
    const { getByRole } = renderWithClient(<RankingsScreen />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('muestra el skeleton durante la carga', () => {
    setupMocks([], true);
    const { queryByRole } = renderWithClient(<RankingsScreen />);
    expect(queryByRole('alert')).toBeNull();
  });

  it('muestra titulo y mensaje de error cuando la carga falla', () => {
    setupMocks([], false, true);
    const { getByRole, getByText } = renderWithClient(<RankingsScreen />);
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('rankings.error_title')).toBeTruthy();
    expect(getByText('rankings.error_server')).toBeTruthy();
  });

  it('muestra el boton de reintento con accessibilityLabel en estado de error', () => {
    setupMocks([], false, true);
    const { getByRole } = renderWithClient(<RankingsScreen />);
    expect(getByRole('button', { name: 'rankings.retry_label' })).toBeTruthy();
  });

  it('renderiza los items del ranking', () => {
    setupMocks(sampleEntries);
    const { getByText } = renderWithClient(<RankingsScreen />);
    expect(getByText('campeon')).toBeTruthy();
    expect(getByText('segundo')).toBeTruthy();
    expect(getByText('tercero')).toBeTruthy();
  });

  it('muestra el estado vacio cuando no hay jugadores', () => {
    setupMocks([]);
    const { getByText } = renderWithClient(<RankingsScreen />);
    expect(getByText('rankings.empty')).toBeTruthy();
  });

  it('muestra la tarjeta de posicion del usuario autenticado', () => {
    setupMocks(sampleEntries, false, false, { rank: 5, xp: 4500 }, 'u1');
    const { getByText } = renderWithClient(<RankingsScreen />);
    expect(getByText('rankings.my_position_label')).toBeTruthy();
    expect(getByText('#5')).toBeTruthy();
  });

  it('muestra guion cuando el usuario no tiene posicion en el ranking', () => {
    setupMocks(sampleEntries, false, false, { rank: null, xp: 100 }, 'u1');
    const { getByText } = renderWithClient(<RankingsScreen />);
    expect(getByText('—')).toBeTruthy();
  });

  it('NO muestra la tarjeta de posicion cuando no hay usuario autenticado', () => {
    setupMocks(sampleEntries, false, false, null, null);
    const { queryByText } = renderWithClient(<RankingsScreen />);
    expect(queryByText('rankings.my_position_label')).toBeNull();
  });

  it('NO muestra la tarjeta de posicion cuando no hay datos de ranking propio', () => {
    setupMocks(sampleEntries, false, false, null, 'u1');
    const { queryByText } = renderWithClient(<RankingsScreen />);
    expect(queryByText('rankings.my_position_label')).toBeNull();
  });

  it('resalta al usuario actual en la lista', () => {
    setupMocks(sampleEntries, false, false, { rank: 1, xp: 9000 }, 'u1');
    const { getByText } = renderWithClient(<RankingsScreen />);
    expect(getByText('campeon (Tú)')).toBeTruthy();
  });

  it('la tarjeta de posicion tiene el accessibilityLabel correcto con rank', () => {
    setupMocks(sampleEntries, false, false, { rank: 3, xp: 6000 }, 'u1');
    const { getByLabelText } = renderWithClient(<RankingsScreen />);
    expect(getByLabelText('rankings.my_position_aria')).toBeTruthy();
  });

  it('la tarjeta de posicion tiene accessibilityLabel de sin ranking cuando rank es null', () => {
    setupMocks(sampleEntries, false, false, { rank: null, xp: 200 }, 'u1');
    const { getByLabelText } = renderWithClient(<RankingsScreen />);
    expect(getByLabelText('rankings.my_position_unranked_aria')).toBeTruthy();
  });

  // FIX4: RefreshControl usa isManualRefreshing local, no isRefetching del query
  it('FIX4: refreshing es false aunque isRefetching del query sea true', () => {
    setupMocks(sampleEntries, false, false, null, null, true);
    const { UNSAFE_getAllByType } = renderWithClient(<RankingsScreen />);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RefreshControl } = require('react-native') as typeof import('react-native');
    const controls = UNSAFE_getAllByType(RefreshControl);
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((ctrl) => {
      expect((ctrl.props as { refreshing: boolean }).refreshing).toBe(false);
    });
  });
});
