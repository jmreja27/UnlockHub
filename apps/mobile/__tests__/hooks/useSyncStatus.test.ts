jest.mock('../../lib/api', () => ({
  api: { get: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

import { renderHook } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import { useSyncStatus } from '../../hooks/useSyncStatus';

const mockUseQuery = useQuery as jest.Mock;

const now = new Date('2024-06-01T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeApiData(overrides: object = {}) {
  return {
    lastSyncAt: new Date(now.getTime() - 5 * 60_000).toISOString(), // hace 5 min
    nextAutoSyncAt: new Date(now.getTime() + 55 * 60_000).toISOString(), // en 55 min
    cooldownRemainingSeconds: 0,
    cooldownUntil: null,
    canSyncNow: true,
    manualSyncsUsedToday: 2,
    dailySyncsLimit: 5,
    anyPlatformLinked: true,
    ...overrides,
  };
}

describe('useSyncStatus', () => {
  it('devuelve estado vacío cuando no hay datos de la API', () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.anyPlatformLinked).toBe(false);
    expect(result.current.lastSyncAt).toBeNull();
    expect(result.current.canSyncNow).toBe(false);
  });

  it('parsea lastSyncAt como Date correctamente', () => {
    mockUseQuery.mockReturnValue({ data: makeApiData() });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.lastSyncAt).toBeInstanceOf(Date);
  });

  it('canSyncNow refleja el valor de la API', () => {
    mockUseQuery.mockReturnValue({ data: makeApiData({ canSyncNow: false }) });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.canSyncNow).toBe(false);
  });

  it('syncsRemaining = dailySyncsLimit - manualSyncsUsedToday', () => {
    mockUseQuery.mockReturnValue({
      data: makeApiData({ dailySyncsLimit: 5, manualSyncsUsedToday: 3 }),
    });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.syncsRemaining).toBe(2);
  });

  it('syncsRemaining = null cuando dailySyncsLimit = null (premium)', () => {
    mockUseQuery.mockReturnValue({
      data: makeApiData({ dailySyncsLimit: null, manualSyncsUsedToday: 0 }),
    });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.syncsRemaining).toBeNull();
  });

  it('timeUntilCooldownEnds es null cuando no hay cooldown', () => {
    mockUseQuery.mockReturnValue({
      data: makeApiData({ cooldownRemainingSeconds: 0, cooldownUntil: null }),
    });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    expect(result.current.timeUntilCooldownEnds).toBeNull();
  });

  it('timeUntilCooldownEnds tiene valor cuando hay cooldown activo', () => {
    const cooldownUntil = new Date(now.getTime() + 12 * 60_000).toISOString();
    mockUseQuery.mockReturnValue({
      data: makeApiData({ cooldownRemainingSeconds: 720, cooldownUntil }),
    });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    // El valor debe ser no-nulo y contener la clave de duración
    expect(result.current.timeUntilCooldownEnds).not.toBeNull();
    expect(result.current.timeUntilCooldownEnds).toContain('library.sync_duration_min');
  });

  it('lastSyncRelative usa formato relativo para "hace 5 min"', () => {
    mockUseQuery.mockReturnValue({ data: makeApiData() });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    // La clave de i18n para "hace 5 min" debe estar presente
    expect(result.current.lastSyncRelative).toContain('library.sync_ago_min');
  });

  it('timeUntilNextAutoSync contiene la clave de duración cuando queda tiempo', () => {
    mockUseQuery.mockReturnValue({ data: makeApiData() });

    const { result } = renderHook(() => useSyncStatus('user-1'));

    // En 55 minutos → clave min
    expect(result.current.timeUntilNextAutoSync).toContain('library.sync_duration_min');
  });

  it('la query está deshabilitada cuando userId es undefined', () => {
    const capturedOptions: { enabled?: boolean } = {};
    mockUseQuery.mockImplementation((opts: { enabled?: boolean }) => {
      Object.assign(capturedOptions, opts);
      return { data: undefined };
    });

    renderHook(() => useSyncStatus(undefined));

    expect(capturedOptions.enabled).toBe(false);
  });
});
