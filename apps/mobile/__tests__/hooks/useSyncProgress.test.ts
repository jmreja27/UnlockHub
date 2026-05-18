jest.mock('../../lib/socket', () => ({
  connectSocket: jest.fn(),
  getSocket: jest.fn(),
}));

jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-native';
import { useSyncProgress } from '../../hooks/useSyncProgress';
import { connectSocket, getSocket } from '../../lib/socket';
import { useSessionStore } from '../../stores/sessionStore';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncCompleteEvent, SyncProgressEvent, SyncErrorEvent } from '@unlockhub/types';

const mockConnectSocket = connectSocket as jest.Mock;
const mockGetSocket = getSocket as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

type SocketEventMap = { [event: string]: ((...args: unknown[]) => void)[] };
type MockSocket = {
  on: jest.Mock;
  off: jest.Mock;
  _emit: (event: string, ...args: unknown[]) => void;
  _listeners: SocketEventMap;
};

function createMockSocket(): MockSocket {
  const listeners: SocketEventMap = {};
  return {
    _listeners: listeners,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    _emit: (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((h) => h(...args));
    },
  };
}

let mockSocket: MockSocket;

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket = createMockSocket();
  mockGetSocket.mockReturnValue(mockSocket);
  mockUseSessionStore.mockReturnValue({ accessToken: 'token-abc', isAuthenticated: true });
  mockUseQueryClient.mockReturnValue(mockQueryClient);
});

describe('useSyncProgress', () => {
  it('estado inicial es isRunning=false', () => {
    const { result } = renderHook(() => useSyncProgress());
    expect(result.current.isRunning).toBe(false);
    expect(result.current.platform).toBeNull();
    expect(result.current.processed).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.percentComplete).toBe(0);
  });

  it('conecta el socket con el accessToken al montarse', () => {
    renderHook(() => useSyncProgress());
    expect(mockConnectSocket).toHaveBeenCalledWith('token-abc');
  });

  it('no conecta el socket si no está autenticado', () => {
    mockUseSessionStore.mockReturnValue({ accessToken: null, isAuthenticated: false });
    renderHook(() => useSyncProgress());
    expect(mockConnectSocket).not.toHaveBeenCalled();
  });

  it('actualiza el estado cuando llega sync:progress', () => {
    const { result } = renderHook(() => useSyncProgress());

    const event: SyncProgressEvent = {
      platform: 'STEAM',
      processed: 20,
      total: 40,
      newGamesCount: 3,
      newAchievementsCount: 12,
      percentComplete: 50,
    };

    act(() => {
      mockSocket._emit('sync:progress', event);
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.platform).toBe('STEAM');
    expect(result.current.processed).toBe(20);
    expect(result.current.total).toBe(40);
    expect(result.current.percentComplete).toBe(50);
    expect(result.current.newGamesCount).toBe(3);
    expect(result.current.newAchievementsCount).toBe(12);
  });

  it('invalida my-games al recibir sync:progress', () => {
    renderHook(() => useSyncProgress());

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'PSN', processed: 5, total: 10,
        newGamesCount: 1, newAchievementsCount: 5, percentComplete: 50,
      } as SyncProgressEvent);
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
  });

  it('resetea el estado y llama onComplete cuando llega sync:complete', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useSyncProgress(onComplete));

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 20, total: 20,
        newGamesCount: 5, newAchievementsCount: 25, percentComplete: 100,
      } as SyncProgressEvent);
    });

    expect(result.current.isRunning).toBe(true);

    const completeEvent: SyncCompleteEvent = {
      platform: 'STEAM',
      totalGames: 20,
      newAchievements: 25,
      xpEarned: 500,
    };

    act(() => {
      mockSocket._emit('sync:complete', completeEvent);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.platform).toBeNull();
    expect(onComplete).toHaveBeenCalledWith(completeEvent);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
  });

  it('resetea el estado cuando llega sync:error', () => {
    const { result } = renderHook(() => useSyncProgress());

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'RA', processed: 5, total: 20,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 25,
      } as SyncProgressEvent);
    });

    expect(result.current.isRunning).toBe(true);

    act(() => {
      mockSocket._emit('sync:error', {
        platform: 'RA', error: 'NETWORK_ERROR', processedBeforeError: 5,
      } as SyncErrorEvent);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.platform).toBeNull();
  });

  it('desregistra los listeners al desmontarse', () => {
    const { unmount } = renderHook(() => useSyncProgress());
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('sync:progress', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('sync:complete', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('sync:error', expect.any(Function));
  });
});
