import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';

import { AdBanner } from '../../components/AdBanner';
import { useSessionStore } from '../../stores/sessionStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('../../stores/preferencesStore', () => ({
  usePreferencesStore: jest.fn(),
}));

const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUsePreferencesStore = usePreferencesStore as unknown as jest.Mock;

describe('AdBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Por defecto el consentimiento está resuelto para no romper tests existentes
    mockUsePreferencesStore.mockReturnValue(true);
  });

  it('renderiza algo para usuarios free', () => {
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { toJSON } = render(<AdBanner />);
    expect(toJSON()).not.toBeNull();
  });

  it('no renderiza nada cuando el usuario es premium', () => {
    mockUseSessionStore.mockReturnValue({ user: { isPremium: true } });
    const { toJSON } = render(<AdBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renderiza algo cuando no hay usuario autenticado', () => {
    mockUseSessionStore.mockReturnValue({ user: null });
    const { toJSON } = render(<AdBanner />);
    expect(toJSON()).not.toBeNull();
  });

  it('no renderiza nada cuando consentResolved es false', () => {
    mockUsePreferencesStore.mockReturnValue(false);
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { toJSON } = render(<AdBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renderiza cuando consentResolved pasa a true', () => {
    mockUsePreferencesStore.mockReturnValue(true);
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { toJSON } = render(<AdBanner />);
    expect(toJSON()).not.toBeNull();
  });

  it('el placeholder tiene el accessibilityLabel correcto', () => {
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { UNSAFE_getAllByType } = render(<AdBanner />);
    const views = UNSAFE_getAllByType(View);
    // El primer View es el placeholder con accessibilityLabel
    const placeholderView = views.find(
      (v) => v.props.accessibilityLabel === 'Espacio publicitario',
    );
    expect(placeholderView).toBeTruthy();
  });

  it('el placeholder tiene accessibilityRole="none"', () => {
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { UNSAFE_getAllByType } = render(<AdBanner />);
    const views = UNSAFE_getAllByType(View);
    const placeholder = views.find(
      (v) => v.props.accessibilityLabel === 'Espacio publicitario',
    );
    expect(placeholder?.props.accessibilityRole).toBe('none');
  });

  it('el placeholder tiene importantForAccessibility="no-hide-descendants"', () => {
    mockUseSessionStore.mockReturnValue({ user: { isPremium: false } });
    const { UNSAFE_getAllByType } = render(<AdBanner />);
    const views = UNSAFE_getAllByType(View);
    const placeholder = views.find(
      (v) => v.props.accessibilityLabel === 'Espacio publicitario',
    );
    expect(placeholder?.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
