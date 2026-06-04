import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LoginScreen from '../../app/(auth)/login';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

jest.mock('../../hooks/useAuth');
jest.mock('../../hooks/useLanguage');

const mockUseAuth = useAuth as jest.Mock;
const mockUseLanguage = useLanguage as jest.Mock;

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoginScreen />
    </QueryClientProvider>,
  );
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      login: jest.fn(),
      isLoggingIn: false,
      loginError: null,
    });
    mockUseLanguage.mockReturnValue({
      currentLanguage: 'es',
      changeLanguage: jest.fn(),
    });
  });

  it('renderiza el título de la app', () => {
    const { getByRole } = renderLogin();
    expect(getByRole('header')).toBeTruthy();
  });

  it('renderiza el campo de email', () => {
    const { getByLabelText } = renderLogin();
    expect(getByLabelText('auth.login.email_label')).toBeTruthy();
  });

  it('renderiza el campo de contraseña', () => {
    const { getByLabelText } = renderLogin();
    expect(getByLabelText('auth.login.password_label')).toBeTruthy();
  });

  it('renderiza el botón de inicio de sesión', () => {
    const { getByRole } = renderLogin();
    expect(getByRole('button', { name: 'auth.login.submit' })).toBeTruthy();
  });

  it('renderiza el botón de crear cuenta', () => {
    const { getByRole } = renderLogin();
    expect(getByRole('button', { name: 'auth.login.create_account_label' })).toBeTruthy();
  });

  it('renderiza el toggle de idioma ES|EN', () => {
    const { getByTestId } = renderLogin();
    expect(getByTestId('language-toggle')).toBeTruthy();
  });

  it('llama a changeLanguage con "en" cuando el idioma activo es "es"', () => {
    const changeLanguage = jest.fn();
    mockUseLanguage.mockReturnValue({ currentLanguage: 'es', changeLanguage });
    const { getByTestId } = renderLogin();
    fireEvent.press(getByTestId('language-toggle'));
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('llama a changeLanguage con "es" cuando el idioma activo es "en"', () => {
    const changeLanguage = jest.fn();
    mockUseLanguage.mockReturnValue({ currentLanguage: 'en', changeLanguage });
    const { getByTestId } = renderLogin();
    fireEvent.press(getByTestId('language-toggle'));
    expect(changeLanguage).toHaveBeenCalledWith('es');
  });

  describe('validación de campos', () => {
    it('muestra error cuando el email está vacío al enviar', async () => {
      const { getByRole, getByText } = renderLogin();
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));
      await waitFor(() => {
        expect(getByText('auth.login.error_email_required')).toBeTruthy();
      });
    });

    it('muestra error cuando el email tiene formato inválido', async () => {
      const { getByLabelText, getByRole, getByText } = renderLogin();
      fireEvent.changeText(getByLabelText('auth.login.email_label'), 'no-es-un-email');
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));
      await waitFor(() => {
        expect(getByText('auth.login.error_email_invalid')).toBeTruthy();
      });
    });

    it('muestra error cuando la contraseña está vacía al enviar', async () => {
      const { getByLabelText, getByRole, getByText } = renderLogin();
      fireEvent.changeText(getByLabelText('auth.login.email_label'), 'test@email.com');
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));
      await waitFor(() => {
        expect(getByText('auth.login.error_password_required')).toBeTruthy();
      });
    });

    it('no llama a login cuando hay errores de validación', () => {
      const login = jest.fn();
      mockUseAuth.mockReturnValue({ login, isLoggingIn: false, loginError: null });
      const { getByRole } = renderLogin();
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));
      expect(login).not.toHaveBeenCalled();
    });

    it('limpia el error de email al editar el campo', async () => {
      const { getByLabelText, getByRole, queryByText } = renderLogin();
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));

      await waitFor(() => {
        expect(queryByText('auth.login.error_email_required')).toBeTruthy();
      });

      fireEvent.changeText(getByLabelText('auth.login.email_label'), 'a');

      await waitFor(() => {
        expect(queryByText('auth.login.error_email_required')).toBeNull();
      });
    });
  });

  describe('envío del formulario', () => {
    it('llama a login con email en minúsculas y contraseña', () => {
      const login = jest.fn();
      mockUseAuth.mockReturnValue({ login, isLoggingIn: false, loginError: null });
      const { getByLabelText, getByRole } = renderLogin();

      fireEvent.changeText(getByLabelText('auth.login.email_label'), 'Test@Email.COM');
      fireEvent.changeText(getByLabelText('auth.login.password_label'), 'MiPass1');
      fireEvent.press(getByRole('button', { name: 'auth.login.submit' }));

      expect(login).toHaveBeenCalledWith({ email: 'test@email.com', password: 'MiPass1' });
    });

    it('muestra el spinner cuando isLoggingIn=true', () => {
      mockUseAuth.mockReturnValue({ login: jest.fn(), isLoggingIn: true, loginError: null });
      const { getByLabelText } = renderLogin();
      expect(getByLabelText('auth.login.loading_label')).toBeTruthy();
    });

    it('el botón está deshabilitado mientras se inicia sesión', () => {
      mockUseAuth.mockReturnValue({ login: jest.fn(), isLoggingIn: true, loginError: null });
      const { getByRole } = renderLogin();
      const button = getByRole('button', { name: 'auth.login.submit' });
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('error del servidor', () => {
    it('muestra el mensaje de error del servidor', () => {
      mockUseAuth.mockReturnValue({
        login: jest.fn(),
        isLoggingIn: false,
        loginError: 'Email o contraseña incorrectos.',
      });
      const { getByText } = renderLogin();
      expect(getByText('Email o contraseña incorrectos.')).toBeTruthy();
    });

    it('el bloque de error tiene accessibilityRole="alert"', () => {
      mockUseAuth.mockReturnValue({
        login: jest.fn(),
        isLoggingIn: false,
        loginError: 'Error de prueba',
      });
      const { getByRole } = renderLogin();
      expect(getByRole('alert')).toBeTruthy();
    });
  });
});
