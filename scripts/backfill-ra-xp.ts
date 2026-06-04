/**
 * Backfill normalizedPoints para logros de RetroAchievements.
 *
 * La fórmula anterior era Math.min(100, Math.max(1, points ?? 1)),
 * que trataba los puntos RA 1:1 con XP (máximo 100).
 * La fórmula correcta es Math.max(5, Math.round(points / 5)).
 *
 * Este script actualiza todos los logros RA en BD para que usen la fórmula correcta.
 * Es idempotente: puede ejecutarse varias veces sin duplicar datos.
 *
 * Uso:
 *   cd apps/api && npx ts-node ../../scripts/backfill-ra-xp.ts
 *
 * Con DATABASE_URL de Railway (desde local):
 *   cd apps/api && DATABASE_URL="${DIRECT_URL}" npx ts-node ../../scripts/backfill-ra-xp.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeRaPoints(rawValue: number | null): number {
  if (!rawValue || rawValue <= 0) return 5;
  return Math.max(5, Math.round(rawValue / 5));
}

async function main() {
  const total = await prisma.achievement.count({
    where: { platform: 'RA' },
  });

  console.log(`Total logros RA en BD: ${total}`);

  // Procesar en lotes de 500 para no saturar la memoria
  const BATCH_SIZE = 500;
  let offset = 0;
  let updated = 0;

  while (offset < total) {
    const achievements = await prisma.achievement.findMany({
      where: { platform: 'RA' },
      select: { id: true, rawValue: true, normalizedPoints: true },
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    for (const ach of achievements) {
      const correctPoints = normalizeRaPoints(ach.rawValue);
      if (ach.normalizedPoints !== correctPoints) {
        await prisma.achievement.update({
          where: { id: ach.id },
          data: { normalizedPoints: correctPoints },
        });
        updated++;
      }
    }

    offset += BATCH_SIZE;
    console.log(`Procesados ${Math.min(offset, total)}/${total} (actualizados hasta ahora: ${updated})`);
  }

  console.log(`\nBackfill completado. Logros actualizados: ${updated}/${total}`);

  // Nota: los UserAchievement.normalizedPoints no existen como campo separado;
  // el XP de los rankings Redis (user.xp en BD) no se recalcula aquí.
  // Para recalcular el XP de todos los usuarios, ejecutar seedRankingsFromDb() o
  // esperar al próximo sync de cada usuario (el worker llama addXp con los nuevos valores).
  console.log('\nNOTA: el XP de usuarios en BD y Redis NO se actualiza automáticamente.');
  console.log('Los usuarios verán el XP corregido en su próximo sync.');
}

main()
  .catch((err) => {
    console.error('Error en backfill:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
