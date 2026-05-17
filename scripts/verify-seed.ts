import { PrismaClient } from '@prisma/client';

async function main() {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const [games, achievements] = await Promise.all([
    prisma.game.count(),
    prisma.achievement.count(),
  ]);
  const byPlatform = await prisma.game.groupBy({ by: ['platform'], _count: { _all: true } });

  console.log('=== Verificación BD producción ===');
  console.log('Total juegos:   ', games);
  console.log('Total logros:   ', achievements);
  console.log('Por plataforma:');
  for (const row of byPlatform) {
    console.log(' ', row.platform.padEnd(8), row._count._all, 'juegos');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
