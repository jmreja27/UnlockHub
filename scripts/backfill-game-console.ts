/**
 * Rellena el campo `console` en los juegos de RetroAchievements ya existentes en la BD.
 *
 * Por cada consola soportada, obtiene la lista de juegos de la API de RA (1 llamada por
 * consola) y actualiza en bloque los registros de la BD cuyo externalId coincida.
 *
 * Steam y Xbox usan console = null (plataforma única) — no necesitan actualización.
 * PSN requiere NPSSO válido: re-ejecutar seed-games.ts para actualizar sus juegos.
 *
 * Ejecutar SIEMPRE desde apps/api/ para que @prisma/client esté disponible:
 *   cd apps/api && npx ts-node ../../scripts/backfill-game-console.ts
 *
 * Variables de entorno necesarias (leer de .env en apps/api/):
 *   RA_SYSTEM_USER — usuario de RetroAchievements del sistema
 *   RA_SYSTEM_KEY  — API key de RetroAchievements del sistema
 */

import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RA_API_BASE = 'https://retroachievements.org/API';
const RA_DELAY_MS = 600;

const RA_CONSOLE_NAMES: Record<number, string> = {
  1: 'Mega Drive',
  2: 'N64',
  3: 'SNES',
  5: 'GBA',
  6: 'Game Boy Color',
  7: 'NES',
  12: 'PlayStation',
  21: 'PlayStation 2',
};

interface RaGameListEntry {
  ID: number | string;
  Title: string;
}

async function main() {
  const username = process.env['RA_SYSTEM_USER'];
  const apiKey = process.env['RA_SYSTEM_KEY'];

  if (!username || !apiKey) {
    console.error('ERROR: RA_SYSTEM_USER y RA_SYSTEM_KEY son requeridos en .env');
    process.exit(1);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [consoleIdStr, consoleName] of Object.entries(RA_CONSOLE_NAMES)) {
    const consoleId = Number(consoleIdStr);
    console.log(`[${consoleName}] Obteniendo lista de juegos (consoleId: ${consoleId})...`);

    let gameList: RaGameListEntry[];
    try {
      const response = await axios.get<RaGameListEntry[]>(
        `${RA_API_BASE}/API_GetGameList.php`,
        {
          params: { z: username, y: apiKey, i: consoleId, h: 1 },
          timeout: 15_000,
        },
      );
      gameList = Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      console.warn(`  [${consoleName}] Error al obtener la lista:`, err instanceof Error ? err.message : String(err));
      continue;
    }

    if (gameList.length === 0) {
      console.log(`  [${consoleName}] Sin juegos en la respuesta — saltando`);
      continue;
    }

    const externalIds = gameList.map((g) => String(g.ID));
    console.log(`  [${consoleName}] ${gameList.length} juegos en la API`);

    const result = await prisma.game.updateMany({
      where: { platform: 'RA', externalId: { in: externalIds } },
      data: { console: consoleName },
    });

    console.log(`  [${consoleName}] ✅ ${result.count} juegos actualizados en BD`);
    const diff = externalIds.length - result.count;
    if (diff > 0) {
      console.log(`  [${consoleName}]    ${diff} juegos en RA API no encontrados en BD (normal)`);
      totalSkipped += diff;
    }
    totalUpdated += result.count;

    await new Promise((r) => setTimeout(r, RA_DELAY_MS));
  }

  console.log('\n── Resumen ──────────────────────────────────────────');
  console.log(`RA actualizados: ${totalUpdated} juegos`);
  if (totalSkipped > 0) {
    console.log(`No encontrados en BD: ${totalSkipped} (juegos de RA no en nuestro catálogo)`);
  }
  console.log('\nSteam: console = null — sin acción necesaria (PC única)');
  console.log('Xbox:  console = null — sin acción necesaria (Xbox única)');
  console.log('PSN:   re-ejecutar seed-games.ts con NPSSO válido para actualizar console');
  console.log('       cd apps/api && npx ts-node ../../scripts/seed-games.ts');
}

main()
  .catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
