import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const POINTS_PER_WEEK = 300;
const DAYS_PER_REDEMPTION = 7;

const ACTIVE_STATUS = 'active';
const CANCELLED_STATUS = 'cancelled';
const EXPIRED_STATUS = 'expired';

// Fecha centinela para suscripciones LIFETIME — nunca vencen
const LIFETIME_EXPIRES_AT = new Date('2099-12-31T23:59:59Z');

interface CreateOrUpdateSubscriptionData {
  plan: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  provider: 'GOOGLE_PLAY' | 'APP_STORE';
  storeTransactionId: string;
  expiresAt?: Date;
}

interface SubscriptionStatus {
  isPremium: boolean;
  plan: string | null;
  expiresAt: Date | null;
  provider: string | null;
}

// Crea o actualiza la suscripción activa del usuario y actualiza isPremium en User.
// Usa upsert por storeTransactionId para garantizar idempotencia.
export async function createOrUpdateSubscription(
  userId: string,
  data: CreateOrUpdateSubscriptionData,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // Desactivar suscripciones activas previas del mismo usuario antes de crear una nueva
  await prisma.subscription.updateMany({
    where: {
      userId,
      status: ACTIVE_STATUS,
      storeTransactionId: { not: data.storeTransactionId },
    },
    data: { status: EXPIRED_STATUS },
  });

  const isLifetime = data.plan === 'LIFETIME';
  const expiresAt = isLifetime ? LIFETIME_EXPIRES_AT : (data.expiresAt as Date);

  await prisma.subscription.upsert({
    where: { storeTransactionId: data.storeTransactionId },
    create: {
      userId,
      plan: data.plan,
      provider: data.provider,
      storeTransactionId: data.storeTransactionId,
      status: ACTIVE_STATUS,
      startedAt: new Date(),
      expiresAt,
    },
    update: {
      plan: data.plan,
      provider: data.provider,
      status: ACTIVE_STATUS,
      expiresAt,
    },
  });

  // LIFETIME: premiumUntil=null (permanente). MONTHLY/ANNUAL: premiumUntil=fecha de expiración.
  await prisma.user.update({
    where: { id: userId },
    data: {
      isPremium: true,
      premiumUntil: isLifetime ? null : expiresAt,
    },
  });
}

// Cancela la suscripción activa del usuario y revoca su estado premium.
export async function cancelSubscription(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId, status: ACTIVE_STATUS },
    orderBy: { createdAt: 'desc' },
  });

  if (!activeSubscription) {
    throw new AppError('No tienes una suscripción activa', 'NO_ACTIVE_SUBSCRIPTION', 404);
  }

  // LIFETIME no se puede cancelar — es un pago único permanente
  if (activeSubscription.plan === 'LIFETIME') {
    throw new AppError(
      'El acceso de por vida no puede cancelarse',
      'LIFETIME_NOT_CANCELLABLE',
      400,
    );
  }

  // Marcar la suscripción como cancelada y revocar el premium del usuario
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: { status: CANCELLED_STATUS },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        isPremium: false,
        premiumUntil: null,
      },
    }),
  ]);
}

// Devuelve el estado de suscripción del usuario autenticado.
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true, premiumUntil: true },
  });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // Si el usuario no es premium, no buscamos suscripción
  if (!user.isPremium) {
    return {
      isPremium: false,
      plan: null,
      expiresAt: null,
      provider: null,
    };
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId, status: ACTIVE_STATUS },
    orderBy: { createdAt: 'desc' },
  });

  return {
    isPremium: user.isPremium,
    plan: activeSubscription?.plan ?? null,
    expiresAt: activeSubscription?.expiresAt ?? user.premiumUntil ?? null,
    provider: activeSubscription?.provider ?? null,
  };
}

interface RedeemPointsResult {
  daysAdded: number;
  premiumUntil: Date;
  pointsSpent: number;
  newBalance: number;
}

// Canjea puntos por días premium. 300 puntos = 7 días.
// Usa transacción para garantizar consistencia entre deducción de puntos y activación de premium.
export async function redeemPointsForPremium(
  userId: string,
  pointsToRedeem: number,
): Promise<RedeemPointsResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPremium: true, premiumUntil: true },
  });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // Validar que sea múltiplo de POINTS_PER_WEEK y al menos 300
  if (pointsToRedeem < POINTS_PER_WEEK || pointsToRedeem % POINTS_PER_WEEK !== 0) {
    throw new AppError(
      `Los puntos deben ser múltiplo de ${POINTS_PER_WEEK} y al menos ${POINTS_PER_WEEK}`,
      'INVALID_POINTS_AMOUNT',
      400,
    );
  }

  // Calcular saldo actual sumando todos los movimientos del historial
  const balanceResult = await prisma.userPoint.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  const currentBalance = balanceResult._sum.amount ?? 0;

  if (currentBalance < pointsToRedeem) {
    throw new AppError(
      `Saldo insuficiente. Tienes ${currentBalance} puntos y necesitas ${pointsToRedeem}`,
      'INSUFFICIENT_POINTS',
      400,
    );
  }

  const daysToAdd = (pointsToRedeem / POINTS_PER_WEEK) * DAYS_PER_REDEMPTION;
  const now = new Date();

  // Calcular nueva fecha de expiración: max(ahora, premiumUntil actual) + días a añadir
  const baseDate = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now;
  const newPremiumUntil = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

  const transactionId = `points-${userId}-${Date.now()}`;

  // Ejecutar en transacción: deducir puntos, actualizar usuario y crear registro de suscripción
  await prisma.$transaction([
    prisma.userPoint.create({
      data: {
        userId,
        amount: -pointsToRedeem,
        reason: 'REDEEM',
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        isPremium: true,
        premiumUntil: newPremiumUntil,
      },
    }),
    prisma.subscription.create({
      data: {
        userId,
        plan: 'POINTS_REDEEM',
        provider: 'INTERNAL',
        storeTransactionId: transactionId,
        status: ACTIVE_STATUS,
        startedAt: now,
        expiresAt: newPremiumUntil,
      },
    }),
  ]);

  const newBalance = currentBalance - pointsToRedeem;

  return {
    daysAdded: daysToAdd,
    premiumUntil: newPremiumUntil,
    pointsSpent: pointsToRedeem,
    newBalance,
  };
}

// Job para expirar suscripciones caducadas. Devuelve el número de suscripciones expiradas.
// Llamar desde un cron job al arrancar el servidor o periódicamente.
export async function expireOldSubscriptions(): Promise<number> {
  const now = new Date();

  // Buscar suscripciones activas vencidas — excluir LIFETIME (nunca vencen)
  const expiredSubscriptions = await prisma.subscription.findMany({
    where: {
      status: ACTIVE_STATUS,
      plan: { not: 'LIFETIME' },
      expiresAt: { lt: now },
    },
    select: { id: true, userId: true },
  });

  if (expiredSubscriptions.length === 0) {
    return 0;
  }

  const expiredIds = expiredSubscriptions.map((s) => s.id);
  const affectedUserIds = [...new Set(expiredSubscriptions.map((s) => s.userId))];

  // Marcar las suscripciones como expiradas y revocar el premium de los usuarios afectados
  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: EXPIRED_STATUS },
    }),
    prisma.user.updateMany({
      where: { id: { in: affectedUserIds } },
      data: { isPremium: false, premiumUntil: null },
    }),
  ]);

  return expiredSubscriptions.length;
}
