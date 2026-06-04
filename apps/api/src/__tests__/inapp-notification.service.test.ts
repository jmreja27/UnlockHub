import * as notifService from '../services/inapp-notification.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockCreate = prisma.notification.create as jest.Mock;
const mockFindMany = prisma.notification.findMany as jest.Mock;
const mockCount = prisma.notification.count as jest.Mock;
const mockUpdateMany = prisma.notification.updateMany as jest.Mock;
const mockFindUnique = prisma.notification.findUnique as jest.Mock;
const mockUpdate = prisma.notification.update as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('createNotification', () => {
  it('crea una notificación con los datos proporcionados', async () => {
    const data = { userId: 'u1', type: 'STREAK_RISK', title: 'Riesgo de racha', body: 'Tu racha está en peligro' };
    mockCreate.mockResolvedValue({ id: 'n1', ...data });

    await notifService.createNotification(data);

    expect(mockCreate).toHaveBeenCalledWith({ data });
  });
});

describe('getNotifications', () => {
  it('devuelve la lista paginada de notificaciones con total', async () => {
    mockFindMany.mockResolvedValue([{ id: 'n1' }]);
    mockCount.mockResolvedValue(5);

    const result = await notifService.getNotifications('u1', 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('aplica skip correcto para la página 2', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await notifService.getNotifications('u1', 2, 10);

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10 }));
  });
});

describe('markAllRead', () => {
  it('marca todas las notificaciones del usuario como leídas', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    await notifService.markAllRead('u1');

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', read: false },
      data: { read: true },
    });
  });
});

describe('markOneRead', () => {
  it('marca una notificación específica como leída', async () => {
    mockFindUnique.mockResolvedValue({ userId: 'u1' });
    mockUpdate.mockResolvedValue({});

    await notifService.markOneRead('u1', 'n1');

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { read: true } });
  });

  it('lanza NOTIFICATION_NOT_FOUND si la notificación no existe', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(notifService.markOneRead('u1', 'no-existe')).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
      statusCode: 404,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('lanza FORBIDDEN si la notificación pertenece a otro usuario', async () => {
    mockFindUnique.mockResolvedValue({ userId: 'otro-usuario' });

    await expect(notifService.markOneRead('u1', 'n1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('getUnreadCount', () => {
  it('devuelve el número de notificaciones no leídas', async () => {
    mockCount.mockResolvedValue(7);

    const count = await notifService.getUnreadCount('u1');

    expect(count).toBe(7);
    expect(mockCount).toHaveBeenCalledWith({ where: { userId: 'u1', read: false } });
  });
});
