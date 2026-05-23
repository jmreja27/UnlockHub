import React from 'react';
import { render } from '@testing-library/react-native';

import { LibraryGameCard } from '../../components/LibraryGameCard';
import type { LibraryGame } from '../../hooks/useMyGames';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

function makeGame(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 'g1',
    title: 'God of War',
    platform: 'PSN',
    iconUrl: null,
    totalAchievements: 40,
    earnedAchievements: 40,
    completionPct: 100,
    lastSyncedAt: null,
    hasPlatinum: true,
    platinumEarned: false,
    isCompleted: false,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('LibraryGameCard — badge PSN simplificado', () => {
  it('no muestra el tick verde cuando isCompleted=false y platinumEarned=false', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: false, isCompleted: false })} />,
    );
    expect(queryByText('✓')).toBeNull();
  });

  it('no muestra el tick verde cuando solo platinumEarned=true (sin isCompleted)', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: false })} />,
    );
    expect(queryByText('✓')).toBeNull();
  });

  it('muestra el tick verde cuando isCompleted=true (aunque platinumEarned=false)', () => {
    const { getByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: false, isCompleted: true })} />,
    );
    expect(getByText('✓')).toBeTruthy();
  });

  it('muestra el tick verde cuando isCompleted=true y platinumEarned=true simultáneamente', () => {
    const { getByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: true })} />,
    );
    expect(getByText('✓')).toBeTruthy();
  });

  it('no muestra el tick verde en juegos de Steam aunque isCompleted=true', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platform: 'STEAM', platinumEarned: true, isCompleted: true })} />,
    );
    expect(queryByText('✓')).toBeNull();
  });
});

describe('LibraryGameCard — renderizado básico', () => {
  it('muestra el título del juego', () => {
    const { getByText } = render(<LibraryGameCard game={makeGame()} />);
    expect(getByText('God of War')).toBeTruthy();
  });

  it('tiene accessibilityRole button', () => {
    const { getByRole } = render(<LibraryGameCard game={makeGame()} />);
    expect(getByRole('button')).toBeTruthy();
  });
});
