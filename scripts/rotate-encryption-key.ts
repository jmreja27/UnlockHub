/**
 * Rotación de clave de cifrado AES-256-GCM para tokens de plataforma.
 *
 * Descifra cada PlatformAccount.encryptedToken con la clave antigua y lo vuelve
 * a cifrar con la nueva. Actualiza la BD antes de que el desarrollador cambie
 * ENCRYPTION_KEY en Fly.io.
 *
 * Uso (desde la raíz del monorepo):
 *   cd apps/api && npx ts-node ../../scripts/rotate-encryption-key.ts \
 *     --old-key=<HEX64> --new-key=<HEX64>
 *
 * Ambas claves deben ser exactamente 64 caracteres hexadecimales (32 bytes = 256 bits).
 * Generar una nueva clave: openssl rand -hex 32
 *
 * IMPORTANTE: ejecutar ANTES de actualizar ENCRYPTION_KEY en Fly.io.
 * Si el script termina con error, NO actualizar la variable de entorno.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const BATCH_SIZE = 50;

function parseArgs(): { oldKey: string; newKey: string } {
  const args = process.argv.slice(2);
  let oldKey = '';
  let newKey = '';
  for (const arg of args) {
    if (arg.startsWith('--old-key=')) oldKey = arg.slice('--old-key='.length);
    if (arg.startsWith('--new-key=')) newKey = arg.slice('--new-key='.length);
  }
  if (!oldKey || !newKey) {
    console.error(
      'Uso: ts-node scripts/rotate-encryption-key.ts --old-key=<HEX64> --new-key=<HEX64>',
    );
    process.exit(1);
  }
  return { oldKey, newKey };
}

function validateHexKey(key: string, name: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    console.error(
      `Error: ${name} debe ser exactamente 64 caracteres hexadecimales (32 bytes = 256 bits)`,
    );
    process.exit(1);
  }
}

function decryptWith(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(ciphertext, 'hex');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

function encryptWith(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

async function main(): Promise<void> {
  const { oldKey, newKey } = parseArgs();
  validateHexKey(oldKey, '--old-key');
  validateHexKey(newKey, '--new-key');

  if (oldKey.toLowerCase() === newKey.toLowerCase()) {
    console.error('Error: La clave nueva es idéntica a la clave antigua. Nada que rotar.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const total = await prisma.platformAccount.count();
    console.log(`Iniciando rotación en ${total} cuentas de plataforma...`);

    let ok = 0;
    let failed = 0;
    let cursor = '';

    while (true) {
      const accounts = await prisma.platformAccount.findMany({
        where: cursor ? { id: { gt: cursor } } : {},
        select: { id: true, encryptedToken: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (accounts.length === 0) break;

      for (const account of accounts) {
        try {
          const plaintext = decryptWith(account.encryptedToken, oldKey);
          const reencrypted = encryptWith(plaintext, newKey);
          await prisma.platformAccount.update({
            where: { id: account.id },
            data: { encryptedToken: reencrypted },
          });
          ok++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ Cuenta ${account.id}: ${msg}`);
          failed++;
        }
      }

      console.log(`  Procesadas ${ok + failed}/${total}...`);
      cursor = accounts[accounts.length - 1]!.id;
      if (accounts.length < BATCH_SIZE) break;
    }

    console.log(`\nResumen: ✓ ${ok} rotadas correctamente, ✗ ${failed} fallidas`);

    if (failed > 0) {
      console.error(
        '\nALERTA: Algunas cuentas fallaron. NO actualizar ENCRYPTION_KEY en Fly.io.',
      );
      console.error('Revisa los errores e intenta de nuevo con la misma clave antigua.');
      process.exit(1);
    }

    console.log('\nRotación completada con éxito.');
    console.log('Ahora actualiza la variable de entorno en Fly.io:');
    console.log(`  fly secrets set ENCRYPTION_KEY=${newKey} --app unlockhub-api`);
    console.log('Y despliega la nueva versión:');
    console.log('  fly deploy --app unlockhub-api');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
