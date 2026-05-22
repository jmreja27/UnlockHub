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

describe('LibraryGameCard — badges PSN independientes', () => {
  it('muestra el badge de platino cuando platinumEarned=true e isCompleted=false', () => {
    const { getByText, queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: false })} />,
    );
    expect(getByText('library.psn_platinum')).toBeTruthy();
    expect(queryByText('library.psn_100')).toBeNull();
  });

  it('muestra el badge 100% cuando isCompleted=true y platinumEarned=false', () => {
    const { getByText, queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: false, isCompleted: true })} />,
    );
    expect(getByText('library.psn_100')).toBeTruthy();
    expect(queryByText('library.psn_platinum')).toBeNull();
  });

  it('muestra ambos badges cuando platinumEarned=true e isCompleted=true', () => {
    const { getByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: true })} />,
    );
    expect(getByText('library.psn_platinum')).toBeTruthy();
    expect(getByText('library.psn_100')).toBeTruthy();
  });

  it('no muestra ningún badge cuando platinumEarned=false e isCompleted=false', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: false, isCompleted: false })} />,
    );
    expect(queryByText('library.psn_platinum')).toBeNull();
    expect(queryByText('library.psn_100')).toBeNull();
  });

  it('no muestra badges PSN en juegos de Steam', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platform: 'STEAM', platinumEarned: true, isCompleted: true })} />,
    );
    expect(queryByText('library.psn_platinum')).toBeNull();
    expect(queryByText('library.psn_100')).toBeNull();
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
