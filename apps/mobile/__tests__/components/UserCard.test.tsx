import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { UserSearchResult } from '@unlockhub/types';

import { UserCard } from '../../components/UserCard';

jest.mock('../../components/AvatarPlaceholder', () => ({
  AvatarPlaceholder: ({ username }: { username: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="avatar-placeholder">{username.slice(0, 2).toUpperCase()}</Text>;
  },
}));

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

  it('muestra AvatarPlaceholder cuando el avatar es null', () => {
    const { getByTestId } = render(<UserCard user={makeUser({ username: 'gamer99', avatar: null })} />);
    expect(getByTestId('avatar-placeholder')).toBeTruthy();
  });

  it('no muestra AvatarPlaceholder cuando el usuario tiene avatar', () => {
    const { queryByTestId } = render(
      <UserCard user={makeUser({ username: 'gamer99', avatar: 'https://example.com/avatar.jpg' })} />
    );
    expect(queryByTestId('avatar-placeholder')).toBeNull();
  });
});
