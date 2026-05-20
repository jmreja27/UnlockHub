/**
 * Rellena el campo `console` en los juegos PSN ya existentes en la BD.
 *
 * Solo llama a getUserTitles() por usuario (sin descargar logros),
 * extrae trophyTitlePlatform y hace updateMany — mucho más rápido que re-seed.
 *
 * Ejecutar SIEMPRE desde apps/api/ para que @prisma/client y psn-api estén disponibles:
 *   cd apps/api && npx ts-node ../../scripts/backfill-psn-console.ts
 *
 * Variables de entorno necesarias:
 *   PSN_NPSSO — cookie NPSSO de PlayStation Network (personal, ~2 meses de validez)
 *   DATABASE_URL — URL de PostgreSQL
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getProfileFromUserName,
} from 'psn-api';
import type { AuthorizationPayload, TrophyTitle } from 'psn-api';

const prisma = new PrismaClient();

const PSN_USERNAMES_DEFAULT = ['Adramm', 'Sorrow_Lord', 'Neozaine', 'Seithek', 'Keching07'];

// Soporte: --usernames="A,B,C"
function parseUsernamesArg(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith('--usernames='));
  if (!arg) return undefined;
  return arg.replace('--usernames=', '').split(',').map((u) => u.trim()).filter(Boolean);
}

async function refreshAuth(npsso: string): Promise<AuthorizationPayload> {
  const code = await exchangeNpssoForAccessCode(npsso);
  const tokens = await exchangeAccessCodeForAuthTokens(code);
  return { accessToken: tokens.accessToken };
}

async function main() {
  const npsso = process.env['PSN_NPSSO'];
  if (!npsso) {
    console.error('ERROR: PSN_NPSSO es requerido en .env');
    process.exit(1);
  }

  console.log('🎮 PSN Console Backfill — autenticando...');
  let auth: AuthorizationPayload;
  try {
    auth = await refreshAuth(npsso);
    console.log('  ✓ Autenticado en PSN\n');
  } catch (err) {
    console.error('  ✗ Error de autenticación:', (err as Error).message);
    process.exit(1);
  }

  const usernamesToProcess = parseUsernamesArg() ?? PSN_USERNAMES_DEFAULT;

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let userIdx = 0; userIdx < usernamesToProcess.length; userIdx++) {
    const username = usernamesToProcess[userIdx];
    console.log(`→ ${username}`);

    // Refrescar token cada 2 usuarios por si acaso
    if (userIdx > 0 && userIdx % 2 === 0) {
      try {
        auth = await refreshAuth(npsso);
        console.log('  ✓ Token PSN refrescado');
      } catch (err) {
        console.warn('  ⚠️  No se pudo refrescar el token:', (err as Error).message);
      }
    }

    let accountId: string;
    try {
      const profileResp = await getProfileFromUserName(auth, username);
      accountId = profileResp.profile.accountId;
    } catch (err) {
      console.error(`  ✗ No se pudo resolver el perfil: ${(err as Error).message}`);
      continue;
    }

    let titles: TrophyTitle[] = [];
    try {
      const allTitles: TrophyTitle[] = [];
      let offset = 0;
      const limit = 200;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const resp = await getUserTitles(auth, accountId, { limit, offset });
        allTitles.push(...resp.trophyTitles);
        if (allTitles.length >= resp.totalItemCount || !resp.nextOffset) break;
        offset = resp.nextOffset;
      }

      titles = allTitles;
      console.log(`  ${titles.length} títulos encontrados`);
    } catch (err) {
      console.error(`  ✗ Error al obtener títulos: ${(err as Error).message}`);
      continue;
    }

    // Agrupar por (npCommunicationId, platform) para updateMany en lote
    const byConsole: Record<string, string[]> = {};
    for (const title of titles) {
      const consoleName = title.trophyTitlePlatform ?? null;
      if (!consoleName) {
        totalSkipped++;
        continue;
      }
      if (!byConsole[consoleName]) byConsole[consoleName] = [];
      byConsole[consoleName].push(title.npCommunicationId);
    }

    for (const [consoleName, ids] of Object.entries(byConsole)) {
      const result = await prisma.game.updateMany({
        where: { platform: 'PSN', externalId: { in: ids } },
        data: { console: consoleName },
      });
      console.log(`  [${consoleName}] ${result.count} juegos actualizados`);
      totalUpdated += result.count;
    }
  }

  console.log('\n── Resumen ──────────────────────────────────────────');
  console.log(`PSN actualizados: ${totalUpdated} juegos`);
  if (totalSkipped > 0) {
    console.log(`Sin trophyTitlePlatform: ${totalSkipped} títulos omitidos`);
  }
}

main()
  .catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
