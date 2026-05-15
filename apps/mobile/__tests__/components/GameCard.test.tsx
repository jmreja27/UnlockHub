import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GameCard } from '../../components/GameCard';
import type { GameSearchResult } from '@unlockhub/types';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router') as { router: { push: jest.Mock } };

function makeGame(overrides: Partial<GameSearchResult> = {}): GameSearchResult {
  return {
    type: 'game',
    id: 'g1',
    platform: 'STEAM',
    title: 'Half-Life 2',
    iconUrl: null,
    totalAchievements: 20,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('GameCard', () => {
  it('muestra el título del juego', () => {
    const { getByText } = render(<GameCard game={makeGame()} />);
    expect(getByText('Half-Life 2')).toBeTruthy();
  });

  it('muestra el número de logros', () => {
    const { getByText } = render(<GameCard game={makeGame({ totalAchievements: 47 })} />);
    expect(getByText('search.achievements_count')).toBeTruthy();
  });

  it('muestra el badge de plataforma Steam', () => {
    const { getByText } = render(<GameCard game={makeGame({ platform: 'STEAM' })} />);
    expect(getByText('Steam')).toBeTruthy();
  });

  it('muestra el badge de plataforma RetroAchievements', () => {
    const { getByText } = render(<GameCard game={makeGame({ platform: 'RA' })} />);
    expect(getByText('RetroAchievements')).toBeTruthy();
  });

  it('navega al detalle del juego al pulsarlo', () => {
    const { getByRole } = render(<GameCard game={makeGame({ id: 'g42' })} />);
    fireEvent.press(getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/game/g42');
  });

  it('tiene accessibilityRole button', () => {
    const { getByRole } = render(<GameCard game={makeGame()} />);
    expect(getByRole('button')).toBeTruthy();
  });

  it('el accessibilityLabel está asignado', () => {
    const { getByRole } = render(<GameCard game={makeGame()} />);
    expect(getByRole('button').props.accessibilityLabel).toBeTruthy();
  });

  it('el título del juego es visible en el contenido', () => {
    const { getByText } = render(<GameCard game={makeGame({ title: 'Portal 2' })} />);
    expect(getByText('Portal 2')).toBeTruthy();
  });
});
