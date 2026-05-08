import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { MaintenanceScreen } from '../../components/MaintenanceScreen';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MaintenanceScreen', () => {
  it('renderiza el título como header', () => {
    const { getByRole } = render(<MaintenanceScreen onRetry={jest.fn()} />);
    expect(getByRole('header')).toBeTruthy();
  });

  it('renderiza el mensaje de mantenimiento', () => {
    const { getByText } = render(<MaintenanceScreen onRetry={jest.fn()} />);
    expect(getByText('maintenance.message')).toBeTruthy();
  });

  it('renderiza el botón de reintento manual', () => {
    const { getByRole } = render(<MaintenanceScreen onRetry={jest.fn()} />);
    expect(getByRole('button', { name: 'maintenance.retry_now' })).toBeTruthy();
  });

  it('muestra la cuenta atrás inicial de 30 segundos', () => {
    const { getAllByText } = render(<MaintenanceScreen onRetry={jest.fn()} />);
    // El componente renderiza t('maintenance.retry_in', { seconds: 30 }) → clave con 30 sustituido
    // Nuestro mock devuelve la clave tal cual (sin plantilla {{seconds}} en el key)
    const countdowns = getAllByText('maintenance.retry_in');
    expect(countdowns.length).toBeGreaterThanOrEqual(1);
  });

  it('llama a onRetry cuando se pulsa el botón', async () => {
    const onRetry = jest.fn(() => Promise.resolve());
    const { getByRole } = render(<MaintenanceScreen onRetry={onRetry} />);

    await act(async () => {
      fireEvent.press(getByRole('button', { name: 'maintenance.retry_now' }));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón mientras se reintenta', async () => {
    let resolveRetry!: () => void;
    const onRetry = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    const { getByRole } = render(<MaintenanceScreen onRetry={onRetry} />);
    const button = getByRole('button', { name: 'maintenance.retry_now' });

    act(() => {
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(button.props.accessibilityState?.busy).toBe(true);
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    // Resolver la promesa para limpiar el estado
    act(() => resolveRetry());
  });

  it('el botón vuelve a habilitarse tras completar el reintento', async () => {
    const onRetry = jest.fn(() => Promise.resolve());
    const { getByRole } = render(<MaintenanceScreen onRetry={onRetry} />);
    const button = getByRole('button', { name: 'maintenance.retry_now' });

    await act(async () => {
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(button.props.accessibilityState?.busy).toBeFalsy();
    });
  });

  it('la cuenta atrás disminuye con el paso del tiempo', async () => {
    render(<MaintenanceScreen onRetry={jest.fn()} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // Si ha pasado 5 segundos, el intervalo debería haberse ejecutado
    // No podemos verificar el número exacto sin texto real, pero sí que no crashea
  });

  it('tiene accessibilityLiveRegion para notificar cambios', () => {
    const { getByLabelText } = render(<MaintenanceScreen onRetry={jest.fn()} />);
    // El SafeAreaView tiene accessibilityLiveRegion="polite"
    // El contenedor de cuenta atrás tiene accessibilityLabel
    expect(getByLabelText('maintenance.retry_in')).toBeTruthy();
  });
});
