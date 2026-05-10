import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  await prisma.user.upsert({
    where: { email: 'demo@unlockhub.test' },
    update: {},
    create: {
      email: 'demo@unlockhub.test',
      username: 'demo',
      passwordHash,
      level: 5,
      xp: 2450,
      streakDays: 3,
      countryCode: 'ES',
    },
  });

  console.log('✓ Demo user upserted');
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
