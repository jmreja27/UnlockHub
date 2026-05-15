import React from 'react';
import { render } from '@testing-library/react-native';
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

const sampleEntries: RankingEntry[] = [
  { userId: 'u1', username: 'campeÃ³n', avatar: null, xp: 9000, rank: 1, countryCode: 'ES' },
  { userId: 'u2', username: 'segundo', avatar: null, xp: 7500, rank: 2, countryCode: null },
  { userId: 'u3', username: 'tercero', avatar: null, xp: 6000, rank: 3, countryCode: 'MX' },
];

function setupMocks(
  entries: RankingEntry[] = [],
  isLoading = false,
  isError = false,
  myRanking: { rank: number | null; xp: number } | null = null,
  currentUserId: string | null = null,
) {
  mockUseGlobalRankings.mockReturnValue({
    data: entries.length > 0 ? { data: entries, total: entries.length } : undefined,
    isLoading,
    isError,
    refetch: jest.fn(),
    isRefetching: false,
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

  it('renderiza el tÃ­tulo', () => {
    setupMocks();
    const { getByRole } = render(<RankingsScreen />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('muestra el skeleton durante la carga', () => {
    setupMocks([], true);
    const { queryByRole } = render(<RankingsScreen />);
    // En carga no hay botÃ³n de reintento ni lista
    expect(queryByRole('alert')).toBeNull();
  });

  it('muestra el tÃ­tulo y mensaje de error cuando la carga falla', () => {
    setupMocks([], false, true);
    const { getByRole, getByText } = render(<RankingsScreen />);
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('rankings.error_title')).toBeTruthy();
    expect(getByText('rankings.error_message')).toBeTruthy();
  });

  it('muestra el botÃ³n de reintento con accessibilityLabel en estado de error', () => {
    setupMocks([], false, true);
    const { getByRole } = render(<RankingsScreen />);
    // El Text con onPress tiene accessibilityRole="button" y accessibilityLabel="rankings.retry_label"
    expect(getByRole('button', { name: 'rankings.retry_label' })).toBeTruthy();
  });

  it('renderiza los Ã­tems del ranking', () => {
    setupMocks(sampleEntries);
    const { getByText } = render(<RankingsScreen />);
    expect(getByText('campeÃ³n')).toBeTruthy();
    expect(getByText('segundo')).toBeTruthy();
    expect(getByText('tercero')).toBeTruthy();
  });

  it('muestra el estado vacÃ­o cuando no hay jugadores', () => {
    setupMocks([]);
    const { getByText } = render(<RankingsScreen />);
    expect(getByText('rankings.empty')).toBeTruthy();
  });

  it('muestra la tarjeta de posiciÃ³n del usuario autenticado', () => {
    setupMocks(sampleEntries, false, false, { rank: 5, xp: 4500 }, 'u1');
    const { getByText } = render(<RankingsScreen />);
    expect(getByText('rankings.my_position_label')).toBeTruthy();
    expect(getByText('#5')).toBeTruthy();
  });

  it('muestra "â€”" cuando el usuario no tiene posiciÃ³n en el ranking', () => {
    setupMocks(sampleEntries, false, false, { rank: null, xp: 100 }, 'u1');
    const { getByText } = render(<RankingsScreen />);
    expect(getByText('—')).toBeTruthy();
  });

  it('NO muestra la tarjeta de posiciÃ³n cuando no hay usuario autenticado', () => {
    setupMocks(sampleEntries, false, false, null, null);
    const { queryByText } = render(<RankingsScreen />);
    expect(queryByText('rankings.my_position_label')).toBeNull();
  });

  it('NO muestra la tarjeta de posiciÃ³n cuando no hay datos de ranking propio', () => {
    setupMocks(sampleEntries, false, false, null, 'u1');
    const { queryByText } = render(<RankingsScreen />);
    expect(queryByText('rankings.my_position_label')).toBeNull();
  });

  it('resalta al usuario actual en la lista con "(Tú)"', () => {
    setupMocks(sampleEntries, false, false, { rank: 1, xp: 9000 }, 'u1');
    const { getByText } = render(<RankingsScreen />);
    expect(getByText('campeÃ³n (Tú)')).toBeTruthy();
  });

  it('la tarjeta de posiciÃ³n tiene el accessibilityLabel correcto con rank', () => {
    setupMocks(sampleEntries, false, false, { rank: 3, xp: 6000 }, 'u1');
    const { getByLabelText } = render(<RankingsScreen />);
    // t('rankings.my_position_aria', { rank: 3, xp: '6,000' }) â†’ clave con 3 y 6000
    expect(getByLabelText('rankings.my_position_aria')).toBeTruthy();
  });

  it('la tarjeta de posiciÃ³n tiene accessibilityLabel de "sin ranking" cuando rank es null', () => {
    setupMocks(sampleEntries, false, false, { rank: null, xp: 200 }, 'u1');
    const { getByLabelText } = render(<RankingsScreen />);
    expect(getByLabelText('rankings.my_position_unranked_aria')).toBeTruthy();
  });
});

