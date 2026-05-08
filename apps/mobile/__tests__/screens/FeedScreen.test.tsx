import React from 'react';
import { FlatList } from 'react-native';
import { render } from '@testing-library/react-native';

import FeedScreen from '../../app/(tabs)/index';
import { useFeed } from '../../hooks/useFeed';
import { useSessionStore } from '../../stores/sessionStore';
import type { ActivityEvent } from '@unlockhub/types';

jest.mock('../../hooks/useFeed');
jest.mock('../../stores/sessionStore');
// AdBanner usa el store; devolvemos null para simplificar
jest.mock('../../components/AdBanner', () => ({ AdBanner: () => null }));

const mockUseFeed = useFeed as jest.Mock;
const mockUseSessionStore = useSessionStore as jest.Mock;

const sampleEvents: ActivityEvent[] = [
  {
    id: 'evt-1',
    userId: 'u1',
    type: 'ACHIEVEMENT_UNLOCKED',
    payload: { title: 'Trofeo de prueba' },
    createdAt: new Date(Date.now() - 60000).toISOString(),
    user: { id: 'u1', username: 'jugador1', avatar: null },
  },
  {
    id: 'evt-2',
    userId: 'u2',
    type: 'LEVEL_UP',
    payload: { level: 5 },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    user: { id: 'u2', username: 'jugador2', avatar: null },
  },
];

describe('FeedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
  });

  it('renderiza el título del feed', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: false, isError: false, refetch: jest.fn() });
    const { getByRole } = render(<FeedScreen />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('muestra el estado de carga (skeleton) mientras se carga', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: true, isError: false, refetch: jest.fn() });
    const { queryByRole } = render(<FeedScreen />);
    // En estado de carga no hay FlashList ni error
    expect(queryByRole('alert')).toBeNull();
  });

  it('muestra el estado de error cuando falla la carga', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: false, isError: true, refetch: jest.fn() });
    const { getByRole } = render(<FeedScreen />);
    expect(getByRole('alert')).toBeTruthy();
  });

  it('muestra el título del error en el estado de error', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: false, isError: true, refetch: jest.fn() });
    const { getByText } = render(<FeedScreen />);
    expect(getByText('feed.error_title')).toBeTruthy();
  });

  it('muestra el mensaje de error secundario', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: false, isError: true, refetch: jest.fn() });
    const { getByText } = render(<FeedScreen />);
    expect(getByText('feed.error_message')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay eventos', () => {
    mockUseFeed.mockReturnValue({ events: [], isLoading: false, isError: false, refetch: jest.fn() });
    const { getByText } = render(<FeedScreen />);
    expect(getByText('feed.empty')).toBeTruthy();
  });

  it('renderiza las tarjetas de actividad cuando hay eventos', () => {
    mockUseFeed.mockReturnValue({
      events: sampleEvents,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const { getAllByRole } = render(<FeedScreen />);
    // Cada ActivityCard tiene accessibilityRole="button"
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('el pull-to-refresh llama a refetch', () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseFeed.mockReturnValue({
      events: sampleEvents,
      isLoading: false,
      isError: false,
      refetch,
    });
    const { UNSAFE_getByType } = render(<FeedScreen />);
    // FlashList está mockeado como FlatList; accedemos al RefreshControl por sus props
    const list = UNSAFE_getByType(FlatList);
    list.props.refreshControl.props.onRefresh();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
