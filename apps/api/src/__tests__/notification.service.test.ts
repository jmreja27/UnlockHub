jest.mock('../lib/prisma', () => ({
  prisma: {
    deviceToken: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { saveDeviceToken, removeDeviceToken, sendPush, sendBulk } from '../services/notification.service';
import { prisma } from '../lib/prisma';

const mockUpsert = prisma.deviceToken.upsert as jest.Mock;
const mockDeleteMany = prisma.deviceToken.deleteMany as jest.Mock;
const mockFindMany = prisma.deviceToken.findMany as jest.Mock;

function okFetchResponse(tickets: { status: string }[]) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ data: tickets }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockDeleteMany.mockResolvedValue({ count: 1 });
  mockFindMany.mockResolvedValue([]);
});

describe('saveDeviceToken', () => {
  it('hace upsert del token', async () => {
    await saveDeviceToken('u1', 'ExponentPushToken[xxx]', 'android');
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'ExponentPushToken[xxx]' },
      create: { userId: 'u1', token: 'ExponentPushToken[xxx]', platform: 'android' },
    }));
  });
});

describe('removeDeviceToken', () => {
  it('elimina el token por valor', async () => {
    await removeDeviceToken('ExponentPushToken[xxx]');
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { token: 'ExponentPushToken[xxx]' } });
  });
});

describe('sendPush', () => {
  it('no llama a fetch si el usuario no tiene tokens', async () => {
    mockFindMany.mockResolvedValue([]);
    await sendPush('u1', 'Título', 'Cuerpo');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('envía notificación a los tokens del usuario', async () => {
    mockFindMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    mockFetch.mockResolvedValue(okFetchResponse([{ status: 'ok' }]));
    await sendPush('u1', 'Título', 'Cuerpo');
    expect(mockFetch).toHaveBeenCalledOnce?.() ?? expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as unknown[];
    expect(body).toHaveLength(1);
  });

  it('lanza error si Expo devuelve !ok', async () => {
    mockFindMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    mockFetch.mockResolvedValue({ ok: false, text: jest.fn().mockResolvedValue('error') });
    await expect(sendPush('u1', 'T', 'B')).rejects.toMatchObject({ code: 'PUSH_API_ERROR' });
  });

  it('loguea warning si hay tickets con error (no lanza)', async () => {
    mockFindMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    mockFetch.mockResolvedValue(okFetchResponse([{ status: 'error', message: 'invalid' }]));
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sendPush('u1', 'T', 'B');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('sendBulk', () => {
  it('no hace nada si userIds está vacío', async () => {
    await sendBulk([], 'T', 'B');
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('envía a todos los tokens de los usuarios indicados', async () => {
    mockFindMany.mockResolvedValue([{ token: 'tok1' }, { token: 'tok2' }]);
    mockFetch.mockResolvedValue(okFetchResponse([{ status: 'ok' }, { status: 'ok' }]));
    await sendBulk(['u1', 'u2'], 'T', 'B');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as unknown[];
    expect(body).toHaveLength(2);
  });
});
