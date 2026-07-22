/**
 * F46 Fase 3 — recálculo histórico de XP tras el pivote a Opción A (Steam usa la curva de
 * rareza normalizeAchievementPoints; PSN ya usa Opción A desde F46 fase 1-2, sin cambios aquí).
 *
 * Tres fases SECUENCIALES — el orden importa, cada una depende de la anterior:
 *   1. Achievement.normalizedPoints (solo Steam) — recalculado con normalizeAchievementPoints(rarity).
 *   2. User.xp / User.level — SUM(normalizedPoints de sus UserAchievement, ya recalculado en fase 1)
 *      + SUM(UserPoint.amount WHERE reason='STREAK'). NUNCA REDEEM/REWARDED_AD/CHALLENGE — esos
 *      crean UserPoint sin pasar por addXp() y nunca formaron parte de User.xp (ver user.service.ts,
 *      subscription.service.ts, points.service.ts).
 *   3. Rankings Redis — seedRankingsFromDb() (ya existe, idempotente, ZADD puro).
 *
 * Idempotente: cada fase recalcula desde la fuente y solo escribe si el valor cambió — correrlo
 * dos veces seguidas no debe alterar nada en la segunda pasada.
 *
 * Modo por defecto: DRY RUN (no escribe nada, solo imprime el diff). Pasar --apply para escribir.
 *
 * Uso:
 *   cd apps/api && npx tsx ../../scripts/backfill-f46-xp.ts                # dry-run (default)
 *   cd apps/api && npx tsx ../../scripts/backfill-f46-xp.ts --apply       # escribe de verdad
 *
 * Con .env.ops de producción (paso aparte, deliberado — NO ejecutar todavía):
 *   cd apps/api && npx tsx --env-file=.env.ops ../../scripts/backfill-f46-xp.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

// Mismas funciones que en producción — nunca reimplementar la curva ni la fórmula de nivel aquí.
function normalizeAchievementPoints(rarityPercent: number | null | undefined): number {
  const valid =
    typeof rarityPercent === 'number' &&
    !isNaN(rarityPercent) &&
    rarityPercent >= 0 &&
    rarityPercent <= 100;
  const rarity = valid ? rarityPercent : 100;

  if (rarity <= 1) return 150;
  if (rarity <= 5) return 100;
  if (rarity <= 10) return 60;
  if (rarity <= 20) return 35;
  if (rarity <= 50) return 15;
  return 5;
}

const XP_PER_LEVEL = 1000;
const MAX_LEVEL = 100;
function calculateLevel(xp: number): number {
  return Math.min(Math.max(1, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1), MAX_LEVEL);
}

// ─── Fase 1 — Achievement.normalizedPoints (Steam) ────────────────────────────

async function phase1RecalculateSteamPoints(): Promise<void> {
  const total = await prisma.achievement.count({ where: { platform: 'STEAM' } });
  console.log(`\n=== FASE 1 — Achievement.normalizedPoints (Steam) ===`);
  console.log(`Total logros Steam en BD: ${total}`);

  let offset = 0;
  let processed = 0;
  let changed = 0;
  let unchanged = 0;

  while (offset < total) {
    const achievements = await prisma.achievement.findMany({
      where: { platform: 'STEAM' },
      select: { id: true, rarity: true, normalizedPoints: true },
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    for (const ach of achievements) {
      processed++;
      const recalculated = normalizeAchievementPoints(ach.rarity);
      if (recalculated !== ach.normalizedPoints) {
        changed++;
        if (APPLY) {
          await prisma.achievement.update({
            where: { id: ach.id },
            data: { normalizedPoints: recalculated },
          });
        }
      } else {
        unchanged++;
      }
    }

    offset += BATCH_SIZE;
    console.log(
      `  Procesados ${Math.min(offset, total)}/${total} (cambiarían: ${changed}, sin cambio: ${unchanged})`,
    );
  }

  console.log(
    `Fase 1 completada. Procesados: ${processed} · ${APPLY ? 'Actualizados' : 'Cambiarían'}: ${changed} · Sin cambio: ${unchanged}`,
  );
}

// ─── Fase 2 — User.xp / User.level ────────────────────────────────────────────

interface UserXpDiff {
  userId: string;
  username: string;
  oldXp: number;
  newXp: number;
  delta: number;
  oldLevel: number;
  newLevel: number;
}

async function phase2RecalculateUserXp(): Promise<UserXpDiff[]> {
  console.log(`\n=== FASE 2 — User.xp / User.level ===`);

  const totalUsers = await prisma.user.count();
  console.log(`Total usuarios en BD: ${totalUsers}`);

  const diffs: UserXpDiff[] = [];
  let offset = 0;
  let processed = 0;
  let changed = 0;

  while (offset < totalUsers) {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, xp: true, level: true },
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    for (const user of users) {
      processed++;

      // xpLogros: SUM de Achievement.normalizedPoints (efectivo tras fase 1) vía UserAchievement.
      // Prisma no permite _sum sobre un campo de la relación, así que se trae y se reduce en memoria.
      // Recalcula el valor efectivo de Steam en memoria (normalizeAchievementPoints(rarity)) en vez
      // de confiar en la columna almacenada — así el dry-run previsualiza el estado POST-fase-1
      // aunque la fase 1 no haya escrito nada todavía (APPLY=false). RA/PSN no cambian con F46 fase 3,
      // así que para esas plataformas se usa directamente el valor ya almacenado.
      const userAchievements = await prisma.userAchievement.findMany({
        where: { userId: user.id },
        select: {
          achievement: { select: { platform: true, rarity: true, normalizedPoints: true } },
        },
      });
      const xpLogros = userAchievements.reduce((sum, ua) => {
        const effectivePoints =
          ua.achievement.platform === 'STEAM'
            ? normalizeAchievementPoints(ua.achievement.rarity)
            : ua.achievement.normalizedPoints;
        return sum + effectivePoints;
      }, 0);

      // xpRacha: SUM de UserPoint.amount SOLO reason='STREAK'. Ningún otro reason entra —
      // REDEEM/REWARDED_AD/CHALLENGE nunca pasaron por addXp() y nunca formaron parte de User.xp.
      const streakAgg = await prisma.userPoint.aggregate({
        where: { userId: user.id, reason: 'STREAK' },
        _sum: { amount: true },
      });
      const xpRacha = streakAgg._sum.amount ?? 0;

      const newXp = xpLogros + xpRacha;
      const newLevel = calculateLevel(newXp);

      if (newXp !== user.xp || newLevel !== user.level) {
        changed++;
        diffs.push({
          userId: user.id,
          username: user.username,
          oldXp: user.xp,
          newXp,
          delta: newXp - user.xp,
          oldLevel: user.level,
          newLevel,
        });

        if (APPLY) {
          await prisma.user.update({
            where: { id: user.id },
            data: { xp: newXp, level: newLevel },
          });
        }
      }
    }

    offset += BATCH_SIZE;
    console.log(`  Procesados ${Math.min(offset, totalUsers)}/${totalUsers} (cambiarían: ${changed})`);
  }

  console.log(
    `Fase 2 completada. Procesados: ${processed} · ${APPLY ? 'Actualizados' : 'Cambiarían'}: ${changed}`,
  );

  return diffs;
}

// ─── Fase 3 — Rankings Redis ──────────────────────────────────────────────────

async function phase3SeedRankings(): Promise<void> {
  console.log(`\n=== FASE 3 — Rankings Redis (seedRankingsFromDb) ===`);

  if (!APPLY) {
    console.log('Dry-run: se omite (seedRankingsFromDb solo tiene sentido tras escribir User.xp real).');
    return;
  }

  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');

  const users = await prisma.user.findMany({
    where: { profileVisibility: 'PUBLIC', deletedAt: null },
    select: { id: true, xp: true, platformAccounts: { select: { platform: true } } },
  });

  for (const user of users) {
    const platforms = user.platformAccounts.map((a) => a.platform);
    await redis.zadd('ranking:global', user.xp, user.id);

    if (platforms.length > 0) {
      const achievements = await prisma.userAchievement.findMany({
        where: { userId: user.id, achievement: { platform: { in: platforms } } },
        select: { achievement: { select: { normalizedPoints: true, platform: true } } },
      });
      const xpMap = new Map<string, number>();
      for (const ua of achievements) {
        const p = ua.achievement.platform as string;
        xpMap.set(p, (xpMap.get(p) ?? 0) + ua.achievement.normalizedPoints);
      }
      await Promise.all(
        platforms.map((p) => redis.zadd(`ranking:platform:${p.toLowerCase()}`, xpMap.get(p) ?? 0, user.id)),
      );
    }
  }

  console.log(`Rankings reconstruidos desde BD: ${users.length} usuarios.`);
  redis.disconnect();
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (escribiendo en BD/Redis)' : 'DRY RUN (sin escribir — pasar --apply para aplicar)'}`);

  await phase1RecalculateSteamPoints();
  const diffs = await phase2RecalculateUserXp();

  if (diffs.length > 0) {
    console.log(`\n=== DIFF de User.xp (${diffs.length} usuarios) ===`);
    for (const d of diffs) {
      console.log(
        `  ${d.username} (${d.userId}): xp ${d.oldXp} → ${d.newXp} (Δ${d.delta >= 0 ? '+' : ''}${d.delta}) · nivel ${d.oldLevel} → ${d.newLevel}`,
      );
    }
  } else {
    console.log('\nSin cambios en User.xp de ningún usuario.');
  }

  await phase3SeedRankings();

  console.log(`\n${APPLY ? 'Backfill aplicado.' : 'Dry-run completado — nada escrito. Ejecutar con --apply para aplicar.'}`);
}

main()
  .catch((err) => {
    console.error('Error en backfill F46 fase 3:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
