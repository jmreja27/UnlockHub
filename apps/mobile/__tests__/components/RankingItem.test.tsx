import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { RankingEntry } from '@unlockhub/types';

import { RankingItem } from '../../components/RankingItem';

function makeEntry(overrides: Partial<RankingEntry> = {}): RankingEntry {
  return {
    userId: 'user-1',
    username: 'gamer_pro',
    avatar: null,
    xp: 500,
    rank: 5,
    countryCode: null,
    ...overrides,
  };
}

describe('RankingItem', () => {
  it('renderiza el nombre de usuario', () => {
    const { getByText } = render(<RankingItem entry={makeEntry({ username: 'superplayer' })} />);
    expect(getByText('superplayer')).toBeTruthy();
  });

  it('renderiza el XP del usuario', () => {
    const { getByText } = render(<RankingItem entry={makeEntry({ xp: 100 })} />);
    expect(getByText('100')).toBeTruthy();
  });

  it('muestra la medalla de oro (🥇) para el puesto 1', () => {
    const { UNSAFE_getAllByType } = render(<RankingItem entry={makeEntry({ rank: 1 })} />);
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.some((t) => t.props.children === '🥇')).toBe(true);
  });

  it('muestra la medalla de plata (🥈) para el puesto 2', () => {
    const { UNSAFE_getAllByType } = render(<RankingItem entry={makeEntry({ rank: 2 })} />);
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.some((t) => t.props.children === '🥈')).toBe(true);
  });

  it('muestra la medalla de bronce (🥉) para el puesto 3', () => {
    const { UNSAFE_getAllByType } = render(<RankingItem entry={makeEntry({ rank: 3 })} />);
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.some((t) => t.props.children === '🥉')).toBe(true);
  });

  it('muestra el número #N para puestos superiores al 3', () => {
    const { UNSAFE_getAllByType } = render(<RankingItem entry={makeEntry({ rank: 10 })} />);
    const texts = UNSAFE_getAllByType(Text);
    // JSX "#{entry.rank}" produce children=['#', 10]; unimos para comparar
    const rankText = texts.find((t) => {
      const c = t.props.children;
      return Array.isArray(c) ? c.join('') === '#10' : String(c) === '#10';
    });
    expect(rankText).toBeTruthy();
  });

  it('añade "(Tú)" al nombre cuando isCurrentUser=true', () => {
    const { getByText } = render(
      <RankingItem entry={makeEntry({ username: 'yo_mismo' })} isCurrentUser />,
    );
    expect(getByText('yo_mismo (Tú)')).toBeTruthy();
  });

  it('no muestra "(Tú)" por defecto', () => {
    const { queryByText } = render(<RankingItem entry={makeEntry({ username: 'otro' })} />);
    expect(queryByText(/\(Tú\)/)).toBeNull();
  });

  it('muestra el código de país cuando está disponible', () => {
    const { getByText } = render(<RankingItem entry={makeEntry({ countryCode: 'ES' })} />);
    expect(getByText('ES')).toBeTruthy();
  });

  it('no muestra código de país cuando es null', () => {
    const { queryByText } = render(<RankingItem entry={makeEntry({ countryCode: null })} />);
    // Ningún texto "null" ni código de país vacío visible
    expect(queryByText('null')).toBeNull();
  });

  it('llama a onPress cuando se pulsa el ítem', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<RankingItem entry={makeEntry()} onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('el accessibilityLabel usa la clave i18n correcta con interpolaciones', () => {
    const entry = makeEntry({ username: 'test_user', xp: 200, rank: 4 });
    const { getByRole } = render(<RankingItem entry={entry} />);
    const button = getByRole('button');
    // El mock de react-i18next devuelve la clave con {{param}} sustituido por el valor
    expect(button.props.accessibilityLabel).toContain('rankings.item_label');
    expect(button.props.accessibilityLabel).toBeTruthy();
  });

  it('el accessibilityLabel usa la clave self para el usuario actual', () => {
    const entry = makeEntry({ username: 'yo', rank: 2 });
    const { getByRole } = render(<RankingItem entry={entry} isCurrentUser />);
    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toContain('rankings.item_label_self');
  });

  it('no incluye accessibilityHint cuando no hay onPress', () => {
    const { getByRole } = render(<RankingItem entry={makeEntry()} />);
    expect(getByRole('button').props.accessibilityHint).toBeUndefined();
  });

  it('incluye accessibilityHint cuando hay onPress', () => {
    const { getByRole } = render(<RankingItem entry={makeEntry()} onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityHint).toBeTruthy();
  });
});
