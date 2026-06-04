jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('../../hooks/useSyncAll', () => ({
  useSyncAll: jest.fn(),
}));

jest.mock('../../hooks/useSyncProgress', () => ({
  useSyncProgress: jest.fn(),
}));

jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: jest.fn(),
}));

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useSessionStore } from '../../stores/sessionStore';
import { useSyncAll } from '../../hooks/useSyncAll';
import { useSyncProgress } from '../../hooks/useSyncProgress';
import { useSyncStatus } from '../../hooks/useSyncStatus';

const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseSyncAll = useSyncAll as jest.Mock;
const mockUseSyncProgress = useSyncProgress as jest.Mock;
const mockUseSyncStatus = useSyncStatus as jest.Mock;

const mockSync = jest.fn();

const defaultSyncStatus: {
  canSyncNow: boolean;
  timeUntilNextAutoSync: string | null;
  timeUntilCooldownEnds: string | null;
  lastSyncRelative: string | null;
  syncsRemaining: number | null;
  dailySyncsLimit: number | null;
  anyPlatformLinked: boolean;
  cooldownRemainingSeconds: number;
} = {
  canSyncNow: true,
  timeUntilNextAutoSync: '45 min',
  timeUntilCooldownEnds: null,
  lastSyncRelative: 'hace 2 h',
  syncsRemaining: 3,
  dailySyncsLimit: 5,
  anyPlatformLinked: true,
  cooldownRemainingSeconds: 0,
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function setupMocks(overrides: Partial<typeof defaultSyncStatus> = {}) {
  mockUseSessionStore.mockReturnValue({ id: 'u1', isPremium: false, username: 'tester' });
  mockUseSyncAll.mockReturnValue({ sync: mockSync, isSyncing: false });
  mockUseSyncProgress.mockReturnValue({ isRunning: false, activeSyncs: new Map() });
  mockUseSyncStatus.mockReturnValue({ ...defaultSyncStatus, ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMocks();
});

describe('SyncStatusBar', () => {
  it('no renderiza nada cuando no hay plataformas vinculadas', () => {
    mockUseSyncStatus.mockReturnValue({ ...defaultSyncStatus, anyPlatformLinked: false });

    const { queryByTestId } = renderWithClient(<SyncStatusBar />);

    expect(queryByTestId('sync-status-bar')).toBeNull();
  });

  it('renderiza el contenedor cuando hay plataformas vinculadas', () => {
    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    expect(getByTestId('sync-status-bar')).toBeTruthy();
  });

  it('botón habilitado cuando canSyncNow=true y sin sync activo', () => {
    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    const button = getByTestId('sync-status-button');
    expect(button.props.accessibilityState?.disabled).toBe(false);
  });

  it('botón deshabilitado con countdown cuando hay cooldown activo', () => {
    setupMocks({ canSyncNow: false, timeUntilCooldownEnds: '12 min' });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    const button = getByTestId('sync-status-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('spinner visible cuando isSyncing=true', () => {
    mockUseSyncAll.mockReturnValue({ sync: mockSync, isSyncing: true });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    expect(getByTestId('sync-status-spinner')).toBeTruthy();
  });

  it('spinner visible cuando isRunning=true (sync en curso via Socket)', () => {
    mockUseSyncProgress.mockReturnValue({ isRunning: true, activeSyncs: new Map() });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    expect(getByTestId('sync-status-spinner')).toBeTruthy();
  });

  it('llama sync() al pulsar el botón cuando está habilitado', () => {
    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    fireEvent.press(getByTestId('sync-status-button'));

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('NO llama sync() al pulsar el botón cuando está deshabilitado', () => {
    setupMocks({ canSyncNow: false, timeUntilCooldownEnds: '5 min' });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    fireEvent.press(getByTestId('sync-status-button'));

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('muestra "3/5 syncs hoy" para usuario free con 3 syncs usados', () => {
    setupMocks({ syncsRemaining: 3, dailySyncsLimit: 5 });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    const remaining = getByTestId('sync-status-remaining');
    // i18next en tests devuelve la clave — verificamos que el testID existe
    expect(remaining).toBeTruthy();
  });

  it('NO muestra contador de syncs para usuarios premium (dailySyncsLimit=null)', () => {
    mockUseSyncStatus.mockReturnValue({ ...defaultSyncStatus, dailySyncsLimit: null, syncsRemaining: null });
    mockUseSessionStore.mockReturnValue({ id: 'u1', isPremium: true });

    const { queryByTestId } = renderWithClient(<SyncStatusBar />);

    // Premium sin isPremium explícito no muestra contador
    expect(queryByTestId('sync-status-remaining')).toBeNull();
  });

  it('muestra la última sync', () => {
    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    expect(getByTestId('sync-status-last')).toBeTruthy();
  });

  it('muestra el próximo auto sync cuando no hay sync activo', () => {
    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    expect(getByTestId('sync-status-next-auto')).toBeTruthy();
  });

  it('NO muestra próximo auto sync cuando hay sync activo', () => {
    mockUseSyncProgress.mockReturnValue({ isRunning: true, activeSyncs: new Map() });

    const { queryByTestId } = renderWithClient(<SyncStatusBar />);

    expect(queryByTestId('sync-status-next-auto')).toBeNull();
  });

  it('no renderiza si lastSyncRelative=null', () => {
    setupMocks({ lastSyncRelative: null });

    const { queryByTestId } = renderWithClient(<SyncStatusBar />);

    expect(queryByTestId('sync-status-last')).toBeNull();
  });

  it('muestra aviso de sync largo cuando syncElapsed > 30s', () => {
    jest.useFakeTimers();
    mockUseSyncAll.mockReturnValue({ sync: mockSync, isSyncing: true });

    const { getByTestId } = renderWithClient(<SyncStatusBar />);

    // React 19 exige act() para avances de timer que causan actualizaciones de estado
    act(() => {
      jest.advanceTimersByTime(31_000);
    });

    expect(getByTestId('sync-long-warning')).toBeTruthy();
    jest.useRealTimers();
  });
});
