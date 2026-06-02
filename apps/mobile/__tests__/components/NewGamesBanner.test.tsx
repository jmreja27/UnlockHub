import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { NewGamesBanner } from '../../components/NewGamesBanner';

describe('NewGamesBanner', () => {
  it('renderiza el testID del botón', () => {
    const { getByTestId } = render(
      <NewGamesBanner count={3} onPress={jest.fn()} />,
    );
    expect(getByTestId('new-games-banner')).toBeTruthy();
  });

  it('tiene accessibilityRole button', () => {
    const { getByRole } = render(
      <NewGamesBanner count={1} onPress={jest.fn()} />,
    );
    expect(getByRole('button')).toBeTruthy();
  });

  it('tiene accessibilityLabel definido', () => {
    const { getByTestId } = render(
      <NewGamesBanner count={2} onPress={jest.fn()} />,
    );
    const btn = getByTestId('new-games-banner');
    // En tests i18next devuelve la clave — verificamos que está definido
    expect(btn.props.accessibilityLabel).toBeTruthy();
  });

  it('llama onPress al pulsar', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <NewGamesBanner count={2} onPress={onPress} />,
    );
    fireEvent.press(getByTestId('new-games-banner'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('usa la clave plural correcta cuando count > 1', () => {
    const { getByText } = render(
      <NewGamesBanner count={5} onPress={jest.fn()} />,
    );
    // i18next en tests devuelve la clave — verificamos que se usa la clave explícita correcta,
    // no el base key (que no existe y mostraría 'library.new_games_banner' como literal en producción)
    expect(getByText('library.new_games_banner_other')).toBeTruthy();
  });

  it('usa la clave singular correcta cuando count === 1', () => {
    const { getByText } = render(
      <NewGamesBanner count={1} onPress={jest.fn()} />,
    );
    expect(getByText('library.new_games_banner_one')).toBeTruthy();
  });
});
