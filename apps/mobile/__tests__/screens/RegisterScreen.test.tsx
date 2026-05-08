import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RegisterScreen from '../../app/(auth)/register';
import { useAuth } from '../../hooks/useAuth';

jest.mock('../../hooks/useAuth');

const mockUseAuth = useAuth as jest.Mock;

function renderRegister() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegisterScreen />
    </QueryClientProvider>,
  );
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      register: jest.fn(),
      isRegistering: false,
      registerError: null,
    });
  });

  it('renderiza el título de la pantalla', () => {
    const { getByRole } = renderRegister();
    expect(getByRole('header')).toBeTruthy();
  });

  it('renderiza el campo de nombre de usuario', () => {
    const { getByLabelText } = renderRegister();
    expect(getByLabelText('auth.register.username_label')).toBeTruthy();
  });

  it('renderiza el campo de email', () => {
    const { getByLabelText } = renderRegister();
    expect(getByLabelText('auth.register.email_label')).toBeTruthy();
  });

  it('renderiza el campo de contraseña', () => {
    const { getByLabelText } = renderRegister();
    expect(getByLabelText('auth.register.password_label')).toBeTruthy();
  });

  it('renderiza el botón de crear cuenta', () => {
    const { getByRole } = renderRegister();
    expect(getByRole('button', { name: 'auth.register.submit' })).toBeTruthy();
  });

  it('renderiza el botón de volver atrás', () => {
    const { getByRole } = renderRegister();
    expect(getByRole('button', { name: 'auth.register.back_label' })).toBeTruthy();
  });

  describe('validación de campos', () => {
    it('muestra error si el nombre de usuario está vacío', async () => {
      const { getByRole, getByText } = renderRegister();
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_username_required')).toBeTruthy();
      });
    });

    it('muestra error si el username tiene menos de 3 caracteres', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'ab');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_username_min')).toBeTruthy();
      });
    });

    it('muestra error si el username supera 30 caracteres', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(
        getByLabelText('auth.register.username_label'),
        'a'.repeat(31),
      );
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_username_max')).toBeTruthy();
      });
    });

    it('muestra error si el username contiene caracteres no permitidos', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'user name!');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_username_format')).toBeTruthy();
      });
    });

    it('acepta username con letras, números, guiones y guiones bajos', async () => {
      const register = jest.fn();
      mockUseAuth.mockReturnValue({ register, isRegistering: false, registerError: null });
      const { getByLabelText, getByRole } = renderRegister();

      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer_pro-99');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'test@test.com');
      fireEvent.changeText(getByLabelText('auth.register.password_label'), 'Password1');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));

      await waitFor(() => expect(register).toHaveBeenCalled());
    });

    it('muestra error si el email está vacío', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer99');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_email_required')).toBeTruthy();
      });
    });

    it('muestra error si el email tiene formato inválido', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer99');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'no-es-email');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_email_invalid')).toBeTruthy();
      });
    });

    it('muestra error si la contraseña tiene menos de 8 caracteres', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer99');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'test@test.com');
      fireEvent.changeText(getByLabelText('auth.register.password_label'), 'Ab1');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_password_min')).toBeTruthy();
      });
    });

    it('muestra error si la contraseña no tiene mayúscula', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer99');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'test@test.com');
      fireEvent.changeText(getByLabelText('auth.register.password_label'), 'password1');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_password_uppercase')).toBeTruthy();
      });
    });

    it('muestra error si la contraseña no tiene número', async () => {
      const { getByLabelText, getByRole, getByText } = renderRegister();
      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'gamer99');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'test@test.com');
      fireEvent.changeText(getByLabelText('auth.register.password_label'), 'PasswordSinNum');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      await waitFor(() => {
        expect(getByText('auth.register.error_password_number')).toBeTruthy();
      });
    });
  });

  describe('envío correcto', () => {
    it('llama a register con los datos validados', async () => {
      const register = jest.fn();
      mockUseAuth.mockReturnValue({ register, isRegistering: false, registerError: null });
      const { getByLabelText, getByRole } = renderRegister();

      fireEvent.changeText(getByLabelText('auth.register.username_label'), 'nuevo_gamer');
      fireEvent.changeText(getByLabelText('auth.register.email_label'), 'nuevo@test.com');
      fireEvent.changeText(getByLabelText('auth.register.password_label'), 'Password1');
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));

      await waitFor(() => {
        expect(register).toHaveBeenCalledWith({
          username: 'nuevo_gamer',
          email: 'nuevo@test.com',
          password: 'Password1',
        });
      });
    });

    it('no llama a register cuando hay errores de validación', () => {
      const register = jest.fn();
      mockUseAuth.mockReturnValue({ register, isRegistering: false, registerError: null });
      const { getByRole } = renderRegister();
      fireEvent.press(getByRole('button', { name: 'auth.register.submit' }));
      expect(register).not.toHaveBeenCalled();
    });

    it('muestra el spinner mientras se registra', () => {
      mockUseAuth.mockReturnValue({ register: jest.fn(), isRegistering: true, registerError: null });
      const { getByLabelText } = renderRegister();
      expect(getByLabelText('auth.register.loading_label')).toBeTruthy();
    });

    it('el botón está deshabilitado mientras se registra', () => {
      mockUseAuth.mockReturnValue({ register: jest.fn(), isRegistering: true, registerError: null });
      const { getByRole } = renderRegister();
      const button = getByRole('button', { name: 'auth.register.submit' });
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('error del servidor', () => {
    it('muestra el mensaje de error del servidor', () => {
      mockUseAuth.mockReturnValue({
        register: jest.fn(),
        isRegistering: false,
        registerError: 'Ya existe una cuenta con ese email.',
      });
      const { getByText } = renderRegister();
      expect(getByText('Ya existe una cuenta con ese email.')).toBeTruthy();
    });

    it('el bloque de error tiene accessibilityRole="alert"', () => {
      mockUseAuth.mockReturnValue({
        register: jest.fn(),
        isRegistering: false,
        registerError: 'Error de prueba',
      });
      const { getByRole } = renderRegister();
      expect(getByRole('alert')).toBeTruthy();
    });
  });
});
