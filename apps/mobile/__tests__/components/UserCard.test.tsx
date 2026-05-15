import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { UserSearchResult } from '@unlockhub/types';

import { UserCard } from '../../components/UserCard';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router') as { router: { push: jest.Mock } };

function makeUser(overrides: Partial<UserSearchResult> = {}): UserSearchResult {
  return {
    type: 'user',
    id: 'u1',
    username: 'gamer_pro',
    avatar: null,
    level: 5,
    xp: 1200,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('UserCard', () => {
  it('muestra el username con @', () => {
    const { getByText } = render(<UserCard user={makeUser({ username: 'testuser' })} />);
    expect(getByText('@testuser')).toBeTruthy();
  });

  it('muestra el XP del usuario', () => {
    const { getByText } = render(<UserCard user={makeUser({ xp: 1200 })} />);
    expect(getByText(/1.200|1,200|1200/)).toBeTruthy();
  });

  it('navega al perfil público al pulsarlo', () => {
    const { getByRole } = render(<UserCard user={makeUser({ username: 'myuser' })} />);
    fireEvent.press(getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/profile/myuser');
  });

  it('tiene accessibilityRole button', () => {
    const { getByRole } = render(<UserCard user={makeUser()} />);
    expect(getByRole('button')).toBeTruthy();
  });

  it('el accessibilityLabel está asignado', () => {
    const { getByRole } = render(<UserCard user={makeUser()} />);
    expect(getByRole('button').props.accessibilityLabel).toBeTruthy();
  });

  it('el username es visible en el contenido de la tarjeta', () => {
    const { getByText } = render(<UserCard user={makeUser({ username: 'testuser' })} />);
    expect(getByText('@testuser')).toBeTruthy();
  });
});
