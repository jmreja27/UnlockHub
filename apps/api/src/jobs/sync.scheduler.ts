import { syncQueue } from './sync.queue';
import { prisma } from '../lib/prisma';
import { SYNC_COOLDOWNS } from '@unlockhub/types';
import { FEATURES } from '../config/features';

// Programa syncs automáticos repetibles para un usuario y plataforma
export async function scheduleAutoSync(
  userId: string,
  platformAccountId: string,
  platform: string,
  isPremium: boolean,
) {
  const tier = (FEATURES.premium && isPremium) ? 'premium' : 'free';
  const intervalMinutes = SYNC_COOLDOWNS[tier].autoSyncIntervalMinutes;

  const jobId = `auto-sync:${userId}:${platform}`;

  await syncQueue.add(
    jobId,
    { userId, platformAccountId, platform: platform as never, triggerType: 'auto' },
    {
      jobId,
      repeat: { every: intervalMinutes * 60 * 1000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );
}

// Cancela el sync automático (p.ej. cuando el usuario desvincula la plataforma)
export async function cancelAutoSync(userId: string, platform: string) {
  const jobId = `auto-sync:${userId}:${platform}`;
  await syncQueue.removeRepeatable(jobId, { every: 0 });
}

// Re-programa todos los syncs automáticos al arrancar el servidor
export async function restoreAutoSyncs() {
  const accounts = await prisma.platformAccount.findMany({
    include: { user: { select: { isPremium: true } } },
  });

  for (const account of accounts) {
    await scheduleAutoSync(
      account.userId,
      account.id,
      account.platform,
      account.user.isPremium,
    );
  }

  console.warn(`Auto-syncs restaurados: ${accounts.length} cuentas`);
}
