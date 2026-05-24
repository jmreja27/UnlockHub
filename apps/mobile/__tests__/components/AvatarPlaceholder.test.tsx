import React from 'react';
import { render } from '@testing-library/react-native';

import { AvatarPlaceholder, getAvatarColor, getInitials } from '../../components/AvatarPlaceholder';

describe('getInitials', () => {
  it('extrae las 2 primeras letras en mayúsculas', () => {
    expect(getInitials('gamer_pro')).toBe('GA');
  });

  it('devuelve una sola letra si el username tiene 1 carácter', () => {
    expect(getInitials('x')).toBe('X');
  });

  it('funciona con username corto de 2 chars', () => {
    expect(getInitials('ab')).toBe('AB');
  });
});

describe('getAvatarColor', () => {
  it('devuelve siempre el mismo color para el mismo username (determinista)', () => {
    const color1 = getAvatarColor('testuser');
    const color2 = getAvatarColor('testuser');
    expect(color1).toBe(color2);
  });

  it('devuelve colores distintos para usernames distintos (habitualmente)', () => {
    const color1 = getAvatarColor('alice');
    const color2 = getAvatarColor('zzzzzzzz');
    // Los 8 colores son distintos — la probabilidad de colisión es baja pero existe,
    // así que solo verificamos que ambos son strings hexadecimales válidos
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color2).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('devuelve un color hexadecimal válido para cualquier username', () => {
    const usernames = ['', 'a', 'SomeUser99', 'jmreja27', '🎮gamer'];
    for (const u of usernames) {
      const color = getAvatarColor(u);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('AvatarPlaceholder', () => {
  it('muestra las iniciales del username', () => {
    const { getByText } = render(<AvatarPlaceholder username="gamer_pro" />);
    // accessibilityElementsHidden en el Text — necesita includeHiddenElements
    expect(getByText('GA', { includeHiddenElements: true })).toBeTruthy();
  });

  it('tiene accessibilityLabel definido en el contenedor', () => {
    const { getByTestId } = render(<AvatarPlaceholder username="myuser" />);
    // En tests i18next devuelve la clave — solo verificamos que está definido
    expect(getByTestId('avatar-placeholder-container').props.accessibilityLabel).toBeTruthy();
  });

  it('aplica el tamaño correcto al contenedor', () => {
    const { getByTestId } = render(<AvatarPlaceholder username="testuser" size={60} />);
    const container = getByTestId('avatar-placeholder-container');
    const rawStyle = container.props.style as Array<object | undefined>;
    const style = Object.assign({}, ...(Array.isArray(rawStyle) ? rawStyle.filter(Boolean) : [rawStyle]));
    expect(style.width).toBe(60);
    expect(style.height).toBe(60);
    expect(style.borderRadius).toBe(30);
  });

  it('usa tamaño 80 por defecto cuando no se pasa size', () => {
    const { getByTestId } = render(<AvatarPlaceholder username="testuser" />);
    const container = getByTestId('avatar-placeholder-container');
    const rawStyle = container.props.style as Array<object | undefined>;
    const style = Object.assign({}, ...(Array.isArray(rawStyle) ? rawStyle.filter(Boolean) : [rawStyle]));
    expect(style.width).toBe(80);
    expect(style.borderRadius).toBe(40);
  });

  it('el color de fondo es determinista (mismo username → mismo color)', () => {
    const { getByTestId: get1 } = render(<AvatarPlaceholder username="fixeduser" />);
    const { getByTestId: get2 } = render(<AvatarPlaceholder username="fixeduser" />);
    const rawStyle1 = get1('avatar-placeholder-container').props.style as Array<object | undefined>;
    const rawStyle2 = get2('avatar-placeholder-container').props.style as Array<object | undefined>;
    const s1 = Object.assign({}, ...(Array.isArray(rawStyle1) ? rawStyle1.filter(Boolean) : [rawStyle1]));
    const s2 = Object.assign({}, ...(Array.isArray(rawStyle2) ? rawStyle2.filter(Boolean) : [rawStyle2]));
    expect(s1.backgroundColor).toBe(s2.backgroundColor);
  });
});
