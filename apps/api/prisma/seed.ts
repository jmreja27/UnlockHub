import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.warn('Ejecutando seed...');

  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@unlockhub.dev' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@unlockhub.dev',
      passwordHash,
      level: 1,
      xp: 0,
    },
  });

  console.warn(`Usuario seed creado: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
