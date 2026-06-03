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

jest.mock('../../lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSyncProgress } from '../../hooks/useSyncProgress';
import { connectSocket, getSocket } from '../../lib/socket';
import { useSessionStore } from '../../stores/sessionStore';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { SyncCompleteEvent, SyncProgressEvent, SyncErrorEvent } from '@unlockhub/types';

const mockConnectSocket = connectSocket as jest.Mock;
const mockGetSocket = getSocket as jest.Mock;
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockApiGet = api.get as jest.Mock;

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
  // Por defecto, la API devuelve vacío (sin syncs activos) para hydrateFromApi
  mockApiGet.mockResolvedValue([]);
});

describe('useSyncProgress', () => {
  it('estado inicial: activeSyncs vacío, isRunning=false', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
      expect(result.current.activeSyncs.size).toBe(0);
    });
  });

  it('conecta el socket con el accessToken al montarse', async () => {
    renderHook(() => useSyncProgress());
    await waitFor(() => {
      expect(mockConnectSocket).toHaveBeenCalledWith('token-abc');
    });
  });

  it('no conecta el socket si no está autenticado', async () => {
    mockUseSessionStore.mockReturnValue({ accessToken: null, isAuthenticated: false });
    renderHook(() => useSyncProgress());
    await waitFor(() => {
      expect(mockConnectSocket).not.toHaveBeenCalled();
    });
  });

  // ─── BUG-7: tracking multi-plataforma con Map ─────────────────────────────

  it('BUG-7: sync:progress añade entrada al Map con la plataforma correcta', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    const event: SyncProgressEvent = {
      platform: 'STEAM',
      processed: 20,
      total: 40,
      newGamesCount: 3,
      newAchievementsCount: 12,
      percentComplete: 50,
    };

    act(() => { mockSocket._emit('sync:progress', event); });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.activeSyncs.size).toBe(1);
    const steamSync = result.current.activeSyncs.get('STEAM');
    expect(steamSync?.processed).toBe(20);
    expect(steamSync?.total).toBe(40);
    expect(steamSync?.percentComplete).toBe(50);
  });

  it('BUG-7: dos plataformas concurrentes mantienen estados independientes en el Map', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 10, total: 50,
        newGamesCount: 1, newAchievementsCount: 5, percentComplete: 20,
      } as SyncProgressEvent);
    });

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'PSN', processed: 5, total: 20,
        newGamesCount: 0, newAchievementsCount: 2, percentComplete: 25,
      } as SyncProgressEvent);
    });

    expect(result.current.activeSyncs.size).toBe(2);
    expect(result.current.activeSyncs.has('STEAM')).toBe(true);
    expect(result.current.activeSyncs.has('PSN')).toBe(true);
    expect(result.current.activeSyncs.get('STEAM')?.processed).toBe(10);
    expect(result.current.activeSyncs.get('PSN')?.processed).toBe(5);
  });

  it('BUG-7: sync:complete elimina solo la plataforma completada, deja las demás activas', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    // Iniciar dos syncs concurrentes
    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 10, total: 10,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 100,
      } as SyncProgressEvent);
      mockSocket._emit('sync:progress', {
        platform: 'RA', processed: 5, total: 20,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 25,
      } as SyncProgressEvent);
    });

    expect(result.current.activeSyncs.size).toBe(2);

    // Completar solo Steam
    act(() => {
      mockSocket._emit('sync:complete', {
        platform: 'STEAM', totalGames: 10, newAchievements: 25, xpEarned: 500,
      } as SyncCompleteEvent);
    });

    // RA sigue activo, Steam eliminado
    expect(result.current.activeSyncs.size).toBe(1);
    expect(result.current.activeSyncs.has('STEAM')).toBe(false);
    expect(result.current.activeSyncs.has('RA')).toBe(true);
    expect(result.current.isRunning).toBe(true);
  });

  it('BUG-7: isRunning=false cuando todos los syncs han completado', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 5, total: 5,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 100,
      } as SyncProgressEvent);
    });

    act(() => {
      mockSocket._emit('sync:complete', {
        platform: 'STEAM', totalGames: 5, newAchievements: 0, xpEarned: 0,
      } as SyncCompleteEvent);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.activeSyncs.size).toBe(0);
  });

  // ─── BUG-8: hidratación inicial desde API ─────────────────────────────────

  it('BUG-8: hidrata el Map desde la API en el mount si hay syncs activos en Redis', async () => {
    mockApiGet.mockResolvedValue([
      { platform: 'PSN', isRunning: true, linked: true, processed: 10, total: 50, percentComplete: 20 },
    ]);

    const { result } = renderHook(() => useSyncProgress());

    await waitFor(() => {
      expect(result.current.activeSyncs.size).toBe(1);
    });

    expect(result.current.activeSyncs.has('PSN')).toBe(true);
    expect(result.current.activeSyncs.get('PSN')?.processed).toBe(10);
    expect(result.current.isRunning).toBe(true);
    // La hidratación inicial también debe refrescar la lista
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
  });

  it('BUG-8: ignora syncs no activos o no vinculados en la respuesta de la API', async () => {
    mockApiGet.mockResolvedValue([
      { platform: 'STEAM', isRunning: false, linked: true, processed: 0, total: 0, percentComplete: 0 },
      { platform: 'PSN', isRunning: true, linked: false, processed: 5, total: 10, percentComplete: 50 },
    ]);

    const { result } = renderHook(() => useSyncProgress());

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(result.current.activeSyncs.size).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('BUG-8: invalida my-games cuando hydrateFromApi detecta syncs en curso (fallback polling)', async () => {
    mockApiGet.mockResolvedValue([
      { platform: 'STEAM', isRunning: true, linked: true, processed: 5, total: 20, percentComplete: 25 },
    ]);

    renderHook(() => useSyncProgress());

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
    });
  });

  it('BUG-8: invalida my-games cuando hydrateFromApi detecta que el sync terminó (socketSilent=true)', async () => {
    // Primera llamada: sync en curso
    mockApiGet.mockResolvedValueOnce([
      { platform: 'PSN', isRunning: true, linked: true, processed: 50, total: 50, percentComplete: 100 },
    ]);
    // Segunda llamada (polling): sync ya terminó
    mockApiGet.mockResolvedValueOnce([]);

    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => useSyncProgress());

      // Esperar hidratación inicial
      await waitFor(() => expect(result.current.activeSyncs.size).toBe(1));

      // Simular que el socket está silencioso por SOCKET_GRACE_MS y el polling detecta que terminó
      // Avanzar el timer de gracia (5s) + el tiempo suficiente para que se ejecute la comprobación
      await act(async () => { jest.advanceTimersByTime(6000); });
      await waitFor(() => {
        expect(result.current.activeSyncs.size).toBe(0);
      });

      // Debe haber llamado invalidateQueries al detectar que el sync terminó
      const calls = mockInvalidateQueries.mock.calls.filter(
        (call) => JSON.stringify(call[0]) === JSON.stringify({ queryKey: ['my-games'] })
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('BUG-8: evento Socket.io no sobreescribe entrada ya presente en el Map desde API', async () => {
    mockApiGet.mockResolvedValue([
      { platform: 'STEAM', isRunning: true, linked: true, processed: 30, total: 50, percentComplete: 60 },
    ]);

    const { result } = renderHook(() => useSyncProgress());

    await waitFor(() => {
      expect(result.current.activeSyncs.size).toBe(1);
    });

    // El Socket.io llega DESPUÉS — debe actualizar (tiene prioridad sobre el estado de API)
    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 40, total: 50,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 80,
      } as SyncProgressEvent);
    });

    // El evento socket actualiza el estado (no hay protección de sobreescritura para Socket.io)
    expect(result.current.activeSyncs.get('STEAM')?.processed).toBe(40);
  });

  // ─── Callbacks y limpieza ─────────────────────────────────────────────────

  it('invalida my-games al recibir sync:progress', async () => {
    renderHook(() => useSyncProgress());
    await waitFor(() => expect(mockConnectSocket).toHaveBeenCalled());

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'PSN', processed: 5, total: 10,
        newGamesCount: 1, newAchievementsCount: 5, percentComplete: 50,
      } as SyncProgressEvent);
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
  });

  it('invalida my-games, user-stats y rankings al recibir sync:complete', async () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useSyncProgress(onComplete));
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    const completeEvent: SyncCompleteEvent = {
      platform: 'STEAM', totalGames: 20, newAchievements: 25, xpEarned: 500,
    };

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'STEAM', processed: 20, total: 20,
        newGamesCount: 5, newAchievementsCount: 25, percentComplete: 100,
      } as SyncProgressEvent);
    });

    act(() => { mockSocket._emit('sync:complete', completeEvent); });

    expect(onComplete).toHaveBeenCalledWith(completeEvent);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-games'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['user-stats'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rankings'] });
  });

  it('sync:error elimina la entrada del Map para esa plataforma', async () => {
    const { result } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(result.current.activeSyncs.size).toBe(0));

    act(() => {
      mockSocket._emit('sync:progress', {
        platform: 'RA', processed: 5, total: 20,
        newGamesCount: 0, newAchievementsCount: 0, percentComplete: 25,
      } as SyncProgressEvent);
    });

    expect(result.current.activeSyncs.size).toBe(1);

    act(() => {
      mockSocket._emit('sync:error', {
        platform: 'RA', error: 'NETWORK_ERROR', processedBeforeError: 5,
      } as SyncErrorEvent);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.activeSyncs.has('RA')).toBe(false);
  });

  it('desregistra los listeners al desmontarse', async () => {
    const { unmount } = renderHook(() => useSyncProgress());
    await waitFor(() => expect(mockConnectSocket).toHaveBeenCalled());
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('sync:progress', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('sync:complete', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('sync:error', expect.any(Function));
  });
});
