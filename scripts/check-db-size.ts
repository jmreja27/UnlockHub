import { PrismaClient } from '@prisma/client';

async function main() {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const rows = await prisma.$queryRaw<{ total: string; games: string; achievements: string }[]>`
    SELECT
      pg_size_pretty(pg_database_size(current_database())) AS total,
      pg_size_pretty(pg_total_relation_size('"Game"')) AS games,
      pg_size_pretty(pg_total_relation_size('"Achievement"')) AS achievements
  `;

  console.log('=== Tamaño BD Railway ===');
  console.log('Total BD:          ', rows[0].total);
  console.log('Tabla Game:        ', rows[0].games);
  console.log('Tabla Achievement: ', rows[0].achievements);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
