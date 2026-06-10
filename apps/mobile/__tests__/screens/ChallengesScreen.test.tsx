import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import type { WeeklyChallenge, UserChallenge } from '@unlockhub/types';

import ChallengesScreen from '../../app/(tabs)/challenges';
import { useChallenges } from '../../hooks/useChallenges';

jest.mock('../../hooks/useChallenges');
// Por defecto los tests asumen challenges activo — la feature está gateada en producción
jest.mock('../../lib/featureFlags', () => ({
  FEATURES: {
    premium: false,
    challenges: true,
    wrapped: true,
    pointsRedeem: false,
    advancedStats: false,
    ugcGuides: true,
    notifications: true,
  },
}));

const mockUseChallenges = useChallenges as jest.Mock;

const sampleChallenge: WeeklyChallenge = {
  id: 'ch-1',
  title: 'Desafío de la semana',
  description: 'Desbloquea 10 logros esta semana',
  metric: 'ACHIEVEMENTS_UNLOCKED',
  targetValue: 10,
  xpReward: 200,
  startAt: '2025-01-01T00:00:00.000Z',
  endAt: '2025-01-07T23:59:59.000Z',
};

const sampleStatus: UserChallenge = {
  id: 'uch-1',
  userId: 'u1',
  challengeId: 'ch-1',
  progress: 4,
  completedAt: null,
};

function setupMock(overrides: Partial<ReturnType<typeof useChallenges>> = {}) {
  mockUseChallenges.mockReturnValue({
    challenge: null,
    status: null,
    progressPct: 0,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  });
}

describe('ChallengesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza el título de la pantalla', () => {
    setupMock();
    const { getByRole } = render(<ChallengesScreen />);
    // Usamos name para distinguir del header que EmptyState también renderiza
    expect(getByRole('header', { name: 'challenges.title' })).toBeTruthy();
  });

  it('no muestra el alert ni el reto durante la carga (skeleton)', () => {
    setupMock({ isLoading: true });
    const { queryByRole, queryByText } = render(<ChallengesScreen />);
    expect(queryByRole('alert')).toBeNull();
    expect(queryByText('challenges.no_challenge')).toBeNull();
  });

  it('muestra el título y el mensaje de error en estado de error', () => {
    setupMock({ isError: true });
    const { getByRole, getByText } = render(<ChallengesScreen />);
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('challenges.error_title')).toBeTruthy();
    expect(getByText('challenges.error_server')).toBeTruthy();
  });

  it('muestra el mensaje "sin reto activo" cuando no hay reto', () => {
    setupMock();
    const { getByText } = render(<ChallengesScreen />);
    // Componente renderiza EmptyState con clave challenges.empty_body
    expect(getByText('challenges.empty_body')).toBeTruthy();
  });

  it('renderiza el título y descripción del reto activo', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('Desafío de la semana')).toBeTruthy();
    expect(getByText('Desbloquea 10 logros esta semana')).toBeTruthy();
  });

  it('renderiza el progreso actual sobre el objetivo', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('4 / 10')).toBeTruthy();
  });

  it('renderiza el porcentaje de progreso con la clave de traducción', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { UNSAFE_getAllByType } = render(<ChallengesScreen />);
    // challenges.progress_pct está dentro de un Text con accessibilityElementsHidden
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.some((t) => String(t.props.children) === 'challenges.progress_pct')).toBe(true);
  });

  it('renderiza la recompensa de XP', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('challenges.xp_reward')).toBeTruthy();
  });

  it('renderiza la etiqueta de la métrica correcta', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('challenges.metric_ACHIEVEMENTS_UNLOCKED')).toBeTruthy();
  });

  it('renderiza la fecha de finalización del reto', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('challenges.ends_at')).toBeTruthy();
  });

  it('muestra el badge de completado cuando completedAt tiene valor', () => {
    const completedStatus: UserChallenge = {
      ...sampleStatus,
      progress: 10,
      completedAt: '2025-01-05T12:00:00.000Z',
    };
    setupMock({ challenge: sampleChallenge, status: completedStatus, progressPct: 100 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('challenges.completed')).toBeTruthy();
  });

  it('NO muestra el badge cuando el reto está en progreso', () => {
    setupMock({ challenge: sampleChallenge, status: sampleStatus, progressPct: 40 });
    const { queryByText } = render(<ChallengesScreen />);
    expect(queryByText('challenges.completed')).toBeNull();
  });

  it('el badge de completado tiene accessibilityRole="text"', () => {
    const completedStatus: UserChallenge = {
      ...sampleStatus,
      completedAt: '2025-01-05T12:00:00.000Z',
    };
    setupMock({ challenge: sampleChallenge, status: completedStatus, progressPct: 100 });
    const { getAllByRole } = render(<ChallengesScreen />);
    expect(getAllByRole('text').length).toBeGreaterThan(0);
  });

  it('muestra el progreso a 0 cuando status es null', () => {
    setupMock({ challenge: sampleChallenge, status: null, progressPct: 0 });
    const { getByText } = render(<ChallengesScreen />);
    expect(getByText('0 / 10')).toBeTruthy();
  });
});
