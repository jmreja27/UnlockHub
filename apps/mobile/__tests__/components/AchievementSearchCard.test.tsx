import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { AchievementSearchResult } from '@unlockhub/types';

import { AchievementSearchCard } from '../../components/AchievementSearchCard';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router') as { router: { push: jest.Mock } };

function makeAchievement(
  overrides: Partial<AchievementSearchResult> = {},
): AchievementSearchResult {
  return {
    type: 'achievement',
    id: 'ach1',
    title: 'First Steps',
    description: 'Complete the first level',
    iconUrl: null,
    rarity: 42.5,
    normalizedPoints: 10,
    platform: 'STEAM',
    game: { id: 'g1', title: 'Half-Life 2', iconUrl: null },
    isUnlocked: false,
    unlockedAt: null,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('AchievementSearchCard', () => {
  it('muestra el título del logro', () => {
    const { getByText } = render(<AchievementSearchCard achievement={makeAchievement()} />);
    expect(getByText('First Steps')).toBeTruthy();
  });

  it('muestra el texto de pertenencia al juego (clave i18n)', () => {
    const { getByText } = render(<AchievementSearchCard achievement={makeAchievement()} />);
    // i18n devuelve la clave en tests, no el texto interpolado
    expect(getByText('search.achievement_in_game')).toBeTruthy();
  });

  it('muestra el badge de plataforma Steam', () => {
    const { getByText } = render(<AchievementSearchCard achievement={makeAchievement({ platform: 'STEAM' })} />);
    expect(getByText('Steam')).toBeTruthy();
  });

  it('muestra el badge de plataforma RetroAchievements', () => {
    const { getByText } = render(
      <AchievementSearchCard achievement={makeAchievement({ platform: 'RA' })} />,
    );
    expect(getByText('RetroAchievements')).toBeTruthy();
  });

  it('muestra el badge de plataforma PlayStation', () => {
    const { getByText } = render(
      <AchievementSearchCard achievement={makeAchievement({ platform: 'PSN' })} />,
    );
    expect(getByText('PlayStation')).toBeTruthy();
  });

  it('muestra los XP del logro', () => {
    const { getByText } = render(
      <AchievementSearchCard achievement={makeAchievement({ normalizedPoints: 50 })} />,
    );
    expect(getByText('search.achievement_xp')).toBeTruthy();
  });

  it('navega a game/[id] al pulsarlo', () => {
    const { getByRole } = render(
      <AchievementSearchCard achievement={makeAchievement({ game: { id: 'g42', title: 'Portal', iconUrl: null } })} />,
    );
    fireEvent.press(getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/game/g42');
  });

  it('tiene accessibilityRole button', () => {
    const { getByRole } = render(<AchievementSearchCard achievement={makeAchievement()} />);
    expect(getByRole('button')).toBeTruthy();
  });

  it('logro desbloqueado: texto en color normal (text-white)', () => {
    const { getByText } = render(
      <AchievementSearchCard achievement={makeAchievement({ isUnlocked: true })} />,
    );
    const titleEl = getByText('First Steps');
    expect(titleEl.props.className).toContain('text-white');
  });

  it('logro no desbloqueado: texto atenuado (text-gray-400)', () => {
    const { getByText } = render(
      <AchievementSearchCard achievement={makeAchievement({ isUnlocked: false })} />,
    );
    const titleEl = getByText('First Steps');
    expect(titleEl.props.className).toContain('text-gray-400');
  });

  it('el accessibilityLabel está asignado', () => {
    const { getByRole } = render(<AchievementSearchCard achievement={makeAchievement()} />);
    expect(getByRole('button').props.accessibilityLabel).toBeTruthy();
  });
});
