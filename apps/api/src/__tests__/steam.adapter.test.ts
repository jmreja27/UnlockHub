import axios from 'axios';

jest.mock('axios');
jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() },
}));
jest.mock('../lib/prisma', () => ({ prisma: {} }));

const mockAxios = axios as jest.Mocked<typeof axios>;

import { resolveVanityUrl, checkSteamProfilePublic } from '../platforms/steam.adapter';

const STEAM_API_KEY = 'test-key';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['STEAM_API_KEY'] = STEAM_API_KEY;
});

afterEach(() => {
  delete process.env['STEAM_API_KEY'];
});

describe('checkSteamProfilePublic', () => {
  it('no lanza si el perfil es público (communityvisibilitystate = 3)', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { players: [{ steamid: '76561198000000001', communityvisibilitystate: 3 }] } },
    });

    await expect(checkSteamProfilePublic('76561198000000001')).resolves.toBeUndefined();
  });

  it('lanza STEAM_PROFILE_PRIVATE si communityvisibilitystate = 1 (privado)', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { players: [{ steamid: '76561198000000001', communityvisibilitystate: 1 }] } },
    });

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_PROFILE_PRIVATE',
      statusCode: 400,
    });
  });

  it('lanza STEAM_PROFILE_PRIVATE si no hay jugador en la respuesta', async () => {
    mockAxios.get.mockResolvedValue({ data: { response: { players: [] } } });

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_PROFILE_PRIVATE',
      statusCode: 400,
    });
  });

  it('lanza STEAM_SYSTEM_NOT_CONFIGURED si no hay API key', async () => {
    delete process.env['STEAM_API_KEY'];

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_SYSTEM_NOT_CONFIGURED',
      statusCode: 503,
    });
  });
});

describe('resolveVanityUrl', () => {
  it('devuelve directamente el SteamID64 si el input son 17 dígitos', async () => {
    const result = await resolveVanityUrl('76561198000000001');
    expect(result).toBe('76561198000000001');
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('resuelve vanityURL a SteamID64 via API', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { success: 1, steamid: '76561198000000001' } },
    });

    const result = await resolveVanityUrl('myusername');
    expect(result).toBe('76561198000000001');
  });

  it('lanza STEAM_USER_NOT_FOUND si la API devuelve success != 1', async () => {
    mockAxios.get.mockResolvedValue({ data: { response: { success: 42 } } });

    await expect(resolveVanityUrl('noexiste')).rejects.toMatchObject({
      code: 'STEAM_USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});
