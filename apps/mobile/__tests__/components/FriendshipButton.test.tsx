import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { FriendshipButton } from '../../components/FriendshipButton';
import { useFriendshipStatus } from '../../hooks/useFriendshipStatus';
import { useFriendshipActions } from '../../hooks/useFriendshipActions';
import { useSessionStore } from '../../stores/sessionStore';

jest.mock('../../hooks/useFriendshipStatus');
jest.mock('../../hooks/useFriendshipActions');
jest.mock('../../stores/sessionStore');

const mockUseFriendshipStatus = useFriendshipStatus as jest.MockedFunction<typeof useFriendshipStatus>;
const mockUseFriendshipActions = useFriendshipActions as jest.MockedFunction<typeof useFriendshipActions>;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

const makeMutations = () => ({
  sendRequest: { mutate: jest.fn(), isPending: false },
  cancelOrRemove: { mutate: jest.fn(), isPending: false },
  accept: { mutate: jest.fn(), isPending: false },
  reject: { mutate: jest.fn(), isPending: false },
});

const defaultUser = { id: 'u1', username: 'me', isPremium: false };

function setupAuth(authenticated = true, user: typeof defaultUser | null = defaultUser) {
  const state = { isAuthenticated: authenticated, user: authenticated ? user : null };
  // Aplicar el selector si la llamada lo usa (e.g. useSessionStore((s) => s.user))
  mockUseSessionStore.mockImplementation((selector: ((s: typeof state) => unknown) | undefined) =>
    typeof selector === 'function' ? selector(state) : state,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setupAuth(true);
  mockUseFriendshipActions.mockReturnValue(makeMutations() as unknown as ReturnType<typeof useFriendshipActions>);
});

describe('FriendshipButton', () => {
  it('no renderiza nada si el usuario no está autenticado', () => {
    setupAuth(false);
    mockUseFriendshipStatus.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useFriendshipStatus>);
    const { toJSON } = render(<FriendshipButton username="otherUser" />);
    expect(toJSON()).toBeNull();
  });

  it('muestra spinner mientras carga el estado', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useFriendshipStatus>);
    const { queryByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(queryByTestId('friendship-btn-add')).toBeNull();
    expect(queryByTestId('friendship-btn-friends')).toBeNull();
  });

  it('no renderiza nada si el estado es blocked', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: { status: 'blocked' }, isLoading: false } as ReturnType<typeof useFriendshipStatus>);
    const { toJSON } = render(<FriendshipButton username="otherUser" />);
    expect(toJSON()).toBeNull();
  });

  it('muestra botón "Añadir amigo" cuando el estado es none', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: { status: 'none' }, isLoading: false } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(getByTestId('friendship-btn-add')).toBeTruthy();
  });

  it('llama a sendRequest.mutate al pulsar "Añadir amigo"', () => {
    const mutations = makeMutations();
    mockUseFriendshipActions.mockReturnValue(mutations as unknown as ReturnType<typeof useFriendshipActions>);
    mockUseFriendshipStatus.mockReturnValue({ data: { status: 'none' }, isLoading: false } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-add'));
    expect(mutations.sendRequest.mutate).toHaveBeenCalled();
  });

  it('muestra estado "Solicitud enviada" y opción "Cancelar" cuando pending_sent', () => {
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'pending_sent', friendshipId: 'f1' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(getByTestId('friendship-btn-pending-sent')).toBeTruthy();
    expect(getByTestId('friendship-btn-cancel')).toBeTruthy();
  });

  it('llama a cancelOrRemove.mutate con el friendshipId al cancelar solicitud', () => {
    const mutations = makeMutations();
    mockUseFriendshipActions.mockReturnValue(mutations as unknown as ReturnType<typeof useFriendshipActions>);
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'pending_sent', friendshipId: 'f1' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-cancel'));
    expect(mutations.cancelOrRemove.mutate).toHaveBeenCalledWith('f1');
  });

  it('muestra botones Aceptar y Rechazar cuando pending_received', () => {
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'pending_received', friendshipId: 'f2' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(getByTestId('friendship-btn-accept')).toBeTruthy();
    expect(getByTestId('friendship-btn-reject')).toBeTruthy();
  });

  it('llama a accept.mutate con el friendshipId al aceptar', () => {
    const mutations = makeMutations();
    mockUseFriendshipActions.mockReturnValue(mutations as unknown as ReturnType<typeof useFriendshipActions>);
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'pending_received', friendshipId: 'f2' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-accept'));
    expect(mutations.accept.mutate).toHaveBeenCalledWith('f2');
  });

  it('llama a reject.mutate con el friendshipId al rechazar', () => {
    const mutations = makeMutations();
    mockUseFriendshipActions.mockReturnValue(mutations as unknown as ReturnType<typeof useFriendshipActions>);
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'pending_received', friendshipId: 'f2' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-reject'));
    expect(mutations.reject.mutate).toHaveBeenCalledWith('f2');
  });

  it('muestra "Sois amigos" y opción "Eliminar amigo" cuando accepted', () => {
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'accepted', friendshipId: 'f3' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(getByTestId('friendship-btn-friends')).toBeTruthy();
    expect(getByTestId('friendship-btn-remove')).toBeTruthy();
  });

  it('muestra Alert de confirmación al pulsar "Eliminar amigo"', () => {
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'accepted', friendshipId: 'f3' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-remove'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'friends.remove_confirm_title',
      'friends.remove_confirm_body',
      expect.arrayContaining([
        expect.objectContaining({ style: 'cancel' }),
        expect.objectContaining({ style: 'destructive' }),
      ]),
    );
  });

  it('llama a cancelOrRemove.mutate tras confirmar "Eliminar amigo"', async () => {
    const mutations = makeMutations();
    mockUseFriendshipActions.mockReturnValue(mutations as unknown as ReturnType<typeof useFriendshipActions>);
    mockUseFriendshipStatus.mockReturnValue({
      data: { status: 'accepted', friendshipId: 'f3' },
      isLoading: false,
    } as ReturnType<typeof useFriendshipStatus>);

    let capturedOnPress: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      capturedOnPress = destructive?.onPress;
    });

    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    fireEvent.press(getByTestId('friendship-btn-remove'));

    expect(capturedOnPress).toBeDefined();
    capturedOnPress?.();
    await waitFor(() => expect(mutations.cancelOrRemove.mutate).toHaveBeenCalledWith('f3'));
  });

  it('todos los botones tienen accessibilityRole button y minHeight 44', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: { status: 'none' }, isLoading: false } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    const btn = getByTestId('friendship-btn-add');
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.style).toMatchObject({ minHeight: 44 });
  });

  it('BUG-1: muestra spinner cuando user es null aunque isAuthenticated=true (timing issue)', () => {
    // isAuthenticated=true pero user no se ha hidratado del store aún
    setupAuth(true, null);
    mockUseFriendshipStatus.mockReturnValue({ data: undefined, isLoading: false, isError: false } as ReturnType<typeof useFriendshipStatus>);
    const { queryByTestId, UNSAFE_getByType } = render(<FriendshipButton username="otherUser" />);
    // No debe mostrar ningún botón de acción
    expect(queryByTestId('friendship-btn-add')).toBeNull();
    // Debe mostrar un ActivityIndicator
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ActivityIndicator } = require('react-native') as typeof import('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('BUG-1: muestra "Añadir amigo" como fallback cuando isError=true y status es undefined', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useFriendshipStatus>);
    const { getByTestId } = render(<FriendshipButton username="otherUser" />);
    expect(getByTestId('friendship-btn-add')).toBeTruthy();
  });

  it('BUG-1: retorna null cuando isError=false y status es undefined (query desactivada, perfil propio)', () => {
    mockUseFriendshipStatus.mockReturnValue({ data: undefined, isLoading: false, isError: false } as ReturnType<typeof useFriendshipStatus>);
    const { toJSON } = render(<FriendshipButton username="otherUser" />);
    expect(toJSON()).toBeNull();
  });
});
