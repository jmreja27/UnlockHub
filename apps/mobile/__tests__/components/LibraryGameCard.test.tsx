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
    lastActivityAt: null,
    hasPlatinum: true,
    platinumEarned: false,
    isCompleted: false,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('LibraryGameCard — badge Platino PSN', () => {
  it('muestra el badge Platino cuando platinumEarned=true en PSN', () => {
    const { getByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true })} />,
    );
    expect(getByText('library.psn_platinum_badge')).toBeTruthy();
  });

  it('no muestra el badge Platino cuando platinumEarned=false', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: false })} />,
    );
    expect(queryByText('library.psn_platinum_badge')).toBeNull();
  });

  it('muestra el badge Platino aunque isCompleted sea false (platino sin DLC)', () => {
    const { getByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: false })} />,
    );
    expect(getByText('library.psn_platinum_badge')).toBeTruthy();
  });

  it('no muestra el badge Platino en juegos de Steam aunque platinumEarned=true', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platform: 'STEAM', platinumEarned: true })} />,
    );
    expect(queryByText('library.psn_platinum_badge')).toBeNull();
  });

  it('no muestra tick verde (comportamiento anterior eliminado)', () => {
    const { queryByText } = render(
      <LibraryGameCard game={makeGame({ platinumEarned: true, isCompleted: true })} />,
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
