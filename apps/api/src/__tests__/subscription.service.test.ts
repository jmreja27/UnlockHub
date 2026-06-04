import * as subscriptionService from '../services/subscription.service';
import { AppError } from '../middleware/errorHandler';

// Mock de Prisma para aislar los tests del servicio de la base de datos
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    userPoint: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Usuario base para los tests
const baseUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hash',
  avatar: null,
  banner: null,
  bio: null,
  level: 1,
  xp: 0,
  streakDays: 0,
  countryCode: null,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

// Suscripción base para los tests
const baseSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  plan: 'MONTHLY' as const,
  provider: 'APP_STORE' as const,
  storeTransactionId: 'txn-abc123',
  status: 'active',
  startedAt: new Date('2024-01-01T00:00:00.000Z'),
  expiresAt: new Date('2024-02-01T00:00:00.000Z'),
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── createOrUpdateSubscription ───────────────────────────────────────────────

describe('subscriptionService.createOrUpdateSubscription', () => {
  it('activa el premium del usuario y realiza upsert de la suscripción', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.subscription.upsert as jest.Mock).mockResolvedValue(baseSubscription);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...baseUser, isPremium: true });

    const expiresAt = new Date('2024-02-01T00:00:00.000Z');

    await subscriptionService.createOrUpdateSubscription('user-1', {
      plan: 'MONTHLY',
      provider: 'APP_STORE',
      storeTransactionId: 'txn-abc123',
      expiresAt,
    });

    expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeTransactionId: 'txn-abc123' },
        create: expect.objectContaining({
          userId: 'user-1',
          plan: 'MONTHLY',
          provider: 'APP_STORE',
          status: 'active',
        }),
      }),
    );

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPremium: true, premiumUntil: expiresAt },
    });
  });

  it('desactiva suscripciones activas previas antes de crear la nueva', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.subscription.upsert as jest.Mock).mockResolvedValue(baseSubscription);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...baseUser, isPremium: true });

    await subscriptionService.createOrUpdateSubscription('user-1', {
      plan: 'ANNUAL',
      provider: 'GOOGLE_PLAY',
      storeTransactionId: 'txn-nueva',
      expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: 'active',
        storeTransactionId: { not: 'txn-nueva' },
      },
      data: { status: 'expired' },
    });
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      subscriptionService.createOrUpdateSubscription('noexiste', {
        plan: 'MONTHLY',
        provider: 'APP_STORE',
        storeTransactionId: 'txn-abc',
        expiresAt: new Date(),
      }),
    ).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('activa LIFETIME con premiumUntil=null y fecha centinela en la suscripción', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.subscription.upsert as jest.Mock).mockResolvedValue({
      ...baseSubscription,
      plan: 'LIFETIME',
      expiresAt: new Date('2099-12-31T23:59:59Z'),
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...baseUser,
      isPremium: true,
      premiumUntil: null,
    });

    await subscriptionService.createOrUpdateSubscription('user-1', {
      plan: 'LIFETIME',
      provider: 'GOOGLE_PLAY',
      storeTransactionId: 'txn-lifetime-001',
    });

    expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plan: 'LIFETIME',
          expiresAt: new Date('2099-12-31T23:59:59Z'),
        }),
      }),
    );

    // premiumUntil debe ser null para LIFETIME — el acceso es permanente
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPremium: true, premiumUntil: null },
    });
  });

  it('lanza AppError con código USER_NOT_FOUND', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    try {
      await subscriptionService.createOrUpdateSubscription('noexiste', {
        plan: 'MONTHLY',
        provider: 'APP_STORE',
        storeTransactionId: 'txn-abc',
        expiresAt: new Date(),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('USER_NOT_FOUND');
    }
  });
});

// ─── cancelSubscription ───────────────────────────────────────────────────────

describe('subscriptionService.cancelSubscription', () => {
  it('cancela la suscripción activa y revoca el premium del usuario', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      isPremium: true,
    });
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(baseSubscription);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);

    await subscriptionService.cancelSubscription('user-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.anything(), // subscription.update
        expect.anything(), // user.update
      ]),
    );
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(subscriptionService.cancelSubscription('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza NO_ACTIVE_SUBSCRIPTION si el usuario no tiene suscripción activa', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(subscriptionService.cancelSubscription('user-1')).rejects.toMatchObject({
      code: 'NO_ACTIVE_SUBSCRIPTION',
      statusCode: 404,
    });
  });

  it('lanza LIFETIME_NOT_CANCELLABLE al intentar cancelar una suscripción LIFETIME', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, isPremium: true });
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      ...baseSubscription,
      plan: 'LIFETIME',
      expiresAt: new Date('2099-12-31T23:59:59Z'),
    });

    await expect(subscriptionService.cancelSubscription('user-1')).rejects.toMatchObject({
      code: 'LIFETIME_NOT_CANCELLABLE',
      statusCode: 400,
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── getSubscriptionStatus ────────────────────────────────────────────────────

describe('subscriptionService.getSubscriptionStatus', () => {
  it('devuelve isPremium=true con plan y fecha de vencimiento para usuario premium', async () => {
    const premiumUntil = new Date('2024-02-01T00:00:00.000Z');
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      isPremium: true,
      premiumUntil,
    });
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      ...baseSubscription,
      expiresAt: premiumUntil,
    });

    const status = await subscriptionService.getSubscriptionStatus('user-1');

    expect(status.isPremium).toBe(true);
    expect(status.plan).toBe('MONTHLY');
    expect(status.expiresAt).toEqual(premiumUntil);
    expect(status.provider).toBe('APP_STORE');
  });

  it('devuelve isPremium=false sin plan ni fecha para usuario free', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      isPremium: false,
      premiumUntil: null,
    });

    const status = await subscriptionService.getSubscriptionStatus('user-1');

    expect(status.isPremium).toBe(false);
    expect(status.plan).toBeNull();
    expect(status.expiresAt).toBeNull();
    expect(status.provider).toBeNull();
    // Usuario free no necesita consultar la tabla subscriptions
    expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(subscriptionService.getSubscriptionStatus('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── expireOldSubscriptions ───────────────────────────────────────────────────

describe('subscriptionService.expireOldSubscriptions', () => {
  it('devuelve 0 si no hay suscripciones caducadas', async () => {
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue([]);

    const count = await subscriptionService.expireOldSubscriptions();

    expect(count).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('expira las suscripciones caducadas y revoca el premium de los usuarios afectados', async () => {
    const expiredSubs = [
      { id: 'sub-1', userId: 'user-1' },
      { id: 'sub-2', userId: 'user-2' },
    ];
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue(expiredSubs);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);

    const count = await subscriptionService.expireOldSubscriptions();

    expect(count).toBe(2);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.anything(), // subscription.updateMany
        expect.anything(), // user.updateMany
      ]),
    );
  });

  it('no expira suscripciones LIFETIME (la query excluye el plan LIFETIME)', async () => {
    // findMany devuelve vacío porque la query ya excluye LIFETIME con `plan: { not: 'LIFETIME' }`
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue([]);

    const count = await subscriptionService.expireOldSubscriptions();

    expect(count).toBe(0);
    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plan: { not: 'LIFETIME' },
        }),
      }),
    );
  });

  it('deduplica los userIds cuando varios subs pertenecen al mismo usuario', async () => {
    // Dos suscripciones expiradas del mismo usuario
    const expiredSubs = [
      { id: 'sub-1', userId: 'user-1' },
      { id: 'sub-2', userId: 'user-1' },
    ];
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue(expiredSubs);
    (mockPrisma.$transaction as jest.Mock).mockImplementation((ops) => Promise.all(ops));

    // Espiamos updateMany para verificar la deduplicación
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const count = await subscriptionService.expireOldSubscriptions();

    expect(count).toBe(2);
    // Verificar que user.updateMany recibe solo un userId único
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['user-1'] } },
      }),
    );
  });
});

// ─── redeemPointsForPremium ───────────────────────────────────────────────────

describe('subscriptionService.redeemPointsForPremium', () => {
  beforeEach(() => {
    (mockPrisma.userPoint.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 600 } });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(subscriptionService.redeemPointsForPremium('noexiste', 300)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza INVALID_POINTS_AMOUNT si el monto no es múltiplo de 300', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);

    await expect(subscriptionService.redeemPointsForPremium('user-1', 150)).rejects.toMatchObject({
      code: 'INVALID_POINTS_AMOUNT',
      statusCode: 400,
    });
  });

  it('lanza INSUFFICIENT_POINTS si el saldo es inferior al canje solicitado', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.userPoint.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 100 } });

    await expect(subscriptionService.redeemPointsForPremium('user-1', 300)).rejects.toMatchObject({
      code: 'INSUFFICIENT_POINTS',
      statusCode: 400,
    });
  });

  it('ejecuta transacción y devuelve nuevo saldo y días añadidos', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);

    const result = await subscriptionService.redeemPointsForPremium('user-1', 300);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.newBalance).toBe(300); // 600 - 300
    expect(result.daysAdded).toBe(7);    // 300 / 300 * 7
  });

  it('añade días sobre premiumUntil existente si el usuario ya es premium', async () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 días en el futuro
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      isPremium: true,
      premiumUntil: futureDate,
    });

    const result = await subscriptionService.redeemPointsForPremium('user-1', 300);

    expect(result.daysAdded).toBe(7);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
