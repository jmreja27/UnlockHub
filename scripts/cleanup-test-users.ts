/**
 * Limpieza de usuarios de prueba antes de promover a Producción pública.
 *
 * CUÁNDO ejecutar:
 *   Justo antes de promover de Pruebas internas a Producción pública.
 *   NO ejecutar antes — las pruebas internas necesitan usuarios con datos reales.
 *
 * USO (ejecutar desde apps/api/):
 *
 *   # Vista previa — muestra conteos sin borrar nada:
 *   cd apps/api && DATABASE_URL="${DIRECT_URL}" REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-test-users.ts --dry-run
 *
 *   # Conservar la cuenta de revisión de Google Play y previsualizar:
 *   cd apps/api && DATABASE_URL="${DIRECT_URL}" REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-test-users.ts --dry-run --preserve-username=TestUser99
 *
 *   # Limpieza completa conservando la cuenta de revisión de Google Play:
 *   cd apps/api && DATABASE_URL="${DIRECT_URL}" REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-test-users.ts --preserve-username=TestUser99
 *
 *   # Limpieza completa sin preservar ninguna cuenta:
 *   cd apps/api && DATABASE_URL="${DIRECT_URL}" REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-test-users.ts
 *
 * QUÉ BORRA (borrado físico, no soft delete):
 *   User y todos sus datos: UserAchievement, UserPoint, UserChallenge,
 *   ActivityEvent, Friendship, Notification, Subscription, PlatformAccount,
 *   RefreshToken, DeviceToken, PasswordResetToken, RankingSnapshot, AchievementGuide.
 *   Rankings Redis: ranking:global, ranking:global:*, ranking:platform:*
 *
 * QUÉ CONSERVA (NO SE TOCA):
 *   Game y Achievement (catálogo — 1.400+ juegos, 72.000+ logros), WeeklyChallenge.
 *
 * IDEMPOTENTE: puede ejecutarse varias veces sin efecto secundario.
 *
 * REQUISITO: DATABASE_URL debe apuntar a la BD de producción (usar DIRECT_URL de Railway).
 *            Obtener REDIS_URL en Railway Dashboard → servicio Redis → Connect → Internal URL.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

interface Args {
  dryRun: boolean;
  preserveUsername: string | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  let preserveUsername: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--preserve-username=')) {
      preserveUsername = arg.slice('--preserve-username='.length).trim() || null;
    }
  }
  return { dryRun, preserveUsername };
}

// ─── Conteo de entidades ──────────────────────────────────────────────────────

interface Counts {
  users: number;
  platformAccounts: number;
  userAchievements: number;
  userPoints: number;
  userChallenges: number;
  activityEvents: number;
  friendships: number;
  notifications: number;
  subscriptions: number;
  refreshTokens: number;
  deviceTokens: number;
  passwordResetTokens: number;
  rankingSnapshots: number;
  achievementGuides: number;
}

async function countEntities(prisma: PrismaClient, userIds: string[]): Promise<Counts> {
  const inUsers = { in: userIds };
  const [
    users,
    platformAccounts,
    userAchievements,
    userPoints,
    userChallenges,
    activityEvents,
    friendships,
    notifications,
    subscriptions,
    refreshTokens,
    deviceTokens,
    passwordResetTokens,
    rankingSnapshots,
    achievementGuides,
  ] = await prisma.$transaction([
    prisma.user.count({ where: { id: inUsers } }),
    prisma.platformAccount.count({ where: { userId: inUsers } }),
    prisma.userAchievement.count({ where: { userId: inUsers } }),
    prisma.userPoint.count({ where: { userId: inUsers } }),
    prisma.userChallenge.count({ where: { userId: inUsers } }),
    prisma.activityEvent.count({ where: { userId: inUsers } }),
    prisma.friendship.count({
      where: { OR: [{ senderId: inUsers }, { receiverId: inUsers }] },
    }),
    prisma.notification.count({ where: { userId: inUsers } }),
    prisma.subscription.count({ where: { userId: inUsers } }),
    prisma.refreshToken.count({ where: { userId: inUsers } }),
    prisma.deviceToken.count({ where: { userId: inUsers } }),
    prisma.passwordResetToken.count({ where: { userId: inUsers } }),
    prisma.rankingSnapshot.count({ where: { userId: inUsers } }),
    prisma.achievementGuide.count({ where: { userId: inUsers } }),
  ]);

  return {
    users,
    platformAccounts,
    userAchievements,
    userPoints,
    userChallenges,
    activityEvents,
    friendships,
    notifications,
    subscriptions,
    refreshTokens,
    deviceTokens,
    passwordResetTokens,
    rankingSnapshots,
    achievementGuides,
  };
}

function printCounts(counts: Counts): void {
  const rows: [string, number][] = [
    ['User', counts.users],
    ['PlatformAccount', counts.platformAccounts],
    ['UserAchievement', counts.userAchievements],
    ['UserPoint', counts.userPoints],
    ['UserChallenge', counts.userChallenges],
    ['ActivityEvent', counts.activityEvents],
    ['Friendship', counts.friendships],
    ['Notification', counts.notifications],
    ['Subscription', counts.subscriptions],
    ['RefreshToken', counts.refreshTokens],
    ['DeviceToken', counts.deviceTokens],
    ['PasswordResetToken', counts.passwordResetTokens],
    ['RankingSnapshot', counts.rankingSnapshots],
    ['AchievementGuide', counts.achievementGuides],
  ];
  for (const [name, count] of rows) {
    console.log(`  ${name.padEnd(22)} ${count}`);
  }
}

// ─── Redis ────────────────────────────────────────────────────────────────────

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

async function handleRedis(dryRun: boolean): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('\n⚠  REDIS_URL no definida — omitiendo limpieza de rankings Redis.');
    console.warn('   Limpiar manualmente: DEL ranking:global y claves ranking:global:* / ranking:platform:*');
    return;
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
  });

  try {
    await redis.connect();

    const globalExists = (await redis.exists('ranking:global')) === 1;
    const globalCountryKeys = await scanKeys(redis, 'ranking:global:*');
    const platformKeys = await scanKeys(redis, 'ranking:platform:*');

    const allKeys = [
      ...(globalExists ? ['ranking:global'] : []),
      ...globalCountryKeys,
      ...platformKeys,
    ];

    console.log('\n  Redis — claves de ranking:');
    console.log(`    ranking:global          ${globalExists ? 1 : 0}`);
    console.log(`    ranking:global:*        ${globalCountryKeys.length}`);
    console.log(`    ranking:platform:*      ${platformKeys.length}`);

    if (allKeys.length === 0) {
      console.log('  No hay claves Redis que borrar.');
      return;
    }

    if (dryRun) {
      console.log(`  [DRY-RUN] Se borrarían ${allKeys.length} clave(s).`);
      return;
    }

    await redis.del(...allKeys);
    console.log(`  ✓ ${allKeys.length} clave(s) Redis eliminadas.`);
  } catch (err) {
    console.warn(`\n⚠  Error al conectar con Redis: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('   Limpiar rankings Redis manualmente antes de abrir a producción.');
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dryRun, preserveUsername } = parseArgs();

  if (dryRun) console.log('══════════ DRY-RUN: no se modificará nada ══════════\n');

  const prisma = new PrismaClient();

  try {
    // 1. Resolver cuenta preservada
    let preservedUserId: string | null = null;
    if (preserveUsername) {
      const user = await prisma.user.findUnique({
        where: { username: preserveUsername },
        select: { id: true, email: true },
      });
      if (!user) {
        console.warn(`⚠  Usuario "${preserveUsername}" no encontrado — se borrarán TODOS los usuarios.\n`);
      } else {
        preservedUserId = user.id;
        console.log(`✓ Cuenta preservada: "${preserveUsername}" (${user.email})\n`);
      }
    }

    // 2. Usuarios a borrar
    const usersToDelete = await prisma.user.findMany({
      where: preservedUserId ? { id: { not: preservedUserId } } : {},
      select: { id: true, username: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = usersToDelete.map((u) => u.id);

    if (userIds.length === 0) {
      console.log('No hay usuarios que borrar. BD ya está limpia.');
      await handleRedis(dryRun);
      return;
    }

    console.log(`Usuarios a borrar (${userIds.length}):`);
    for (const u of usersToDelete) {
      console.log(`  - ${u.username.padEnd(20)} ${u.email}`);
    }

    // 3. Conteo ANTES
    console.log('\nConteo ANTES (entidades que se borrarán):');
    const before = await countEntities(prisma, userIds);
    printCounts(before);

    // 4. Catálogo — confirmar que NO se toca
    const [totalGames, totalAchievements] = await prisma.$transaction([
      prisma.game.count(),
      prisma.achievement.count(),
    ]);
    console.log('\nCatálogo (NO se toca):');
    console.log(`  Game                   ${totalGames}`);
    console.log(`  Achievement            ${totalAchievements}`);

    // 5. DRY-RUN: mostrar Redis y salir
    if (dryRun) {
      await handleRedis(true);
      console.log('\n══════════ DRY-RUN finalizado — ejecutar sin --dry-run para proceder ══════════');
      return;
    }

    // 6. Transacción BD atómica — tablas hijo primero, User al final
    console.log('\nEjecutando transacción Prisma...');
    const inUsers = { in: userIds };
    await prisma.$transaction([
      prisma.userAchievement.deleteMany({ where: { userId: inUsers } }),
      prisma.userPoint.deleteMany({ where: { userId: inUsers } }),
      prisma.userChallenge.deleteMany({ where: { userId: inUsers } }),
      prisma.activityEvent.deleteMany({ where: { userId: inUsers } }),
      prisma.friendship.deleteMany({
        where: { OR: [{ senderId: inUsers }, { receiverId: inUsers }] },
      }),
      prisma.notification.deleteMany({ where: { userId: inUsers } }),
      prisma.subscription.deleteMany({ where: { userId: inUsers } }),
      prisma.platformAccount.deleteMany({ where: { userId: inUsers } }),
      prisma.refreshToken.deleteMany({ where: { userId: inUsers } }),
      prisma.deviceToken.deleteMany({ where: { userId: inUsers } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: inUsers } }),
      prisma.rankingSnapshot.deleteMany({ where: { userId: inUsers } }),
      prisma.achievementGuide.deleteMany({ where: { userId: inUsers } }),
      // User al final — todas las tablas hijo ya limpiadas arriba
      prisma.user.deleteMany({ where: { id: inUsers } }),
    ]);
    console.log('✓ Transacción BD completada.');

    // 7. Limpieza Redis
    await handleRedis(false);

    // 8. Conteo DESPUÉS — verificar integridad del catálogo
    const [remainingUsers, remainingGames, remainingAchievements] = await prisma.$transaction([
      prisma.user.count(),
      prisma.game.count(),
      prisma.achievement.count(),
    ]);

    console.log('\nEstado DESPUÉS:');
    console.log(`  Usuarios restantes:    ${remainingUsers}`);
    console.log(`  Game (catálogo):       ${remainingGames}  ← debe coincidir con antes`);
    console.log(`  Achievement (catálogo): ${remainingAchievements}  ← debe coincidir con antes`);

    if (remainingGames !== totalGames || remainingAchievements !== totalAchievements) {
      console.error('\n✗ ALERTA: el catálogo cambió durante la limpieza. Revisar manualmente.');
      process.exit(1);
    }

    console.log('\n✓ Limpieza completada. BD lista para Producción pública.');
    if (preservedUserId) {
      console.log(`  Cuenta de revisión "${preserveUsername}" conservada y activa.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('\n✗ Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
