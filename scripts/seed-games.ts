/**
 * Seed de juegos y logros populares para UnlockHub.
 *
 * IMPORTANTE: ejecutar SIEMPRE desde apps/api/ para que @prisma/client y psn-api
 * se resuelvan correctamente desde apps/api/node_modules.
 *
 *   cd apps/api && npx tsx ../../scripts/seed-games.ts
 *
 * Variables de entorno (de apps/api/.env o exportadas en el shell):
 *   DATABASE_URL    — URL de PostgreSQL (requerida)
 *   STEAM_API_KEY   — clave de Steam Web API (requerida para sección Steam)
 *   RA_SYSTEM_USER  — usuario de RetroAchievements (requerida para sección RA)
 *   RA_SYSTEM_KEY   — API key de RetroAchievements (requerida para sección RA)
 *   PSN_NPSSO       — cookie NPSSO de PlayStation Network (requerida para sección PSN)
 *
 * El script es idempotente: usa upsert. Puede interrumpirse y reanudarse.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getProfileFromUserName,
} from 'psn-api';
import type { AuthorizationPayload, TrophyTitle, Trophy } from 'psn-api';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SeedResult {
  gamesProcessed: number;
  gamesCreated: number;
  achievementsCreated: number;
  errors: number;
}

interface SteamSpyEntry {
  appid: number;
  name: string;
}

interface SteamSchemaAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
}

interface SteamGlobalAchievementPercentage {
  name: string;
  percent: number;
}

interface RaGameListEntry {
  ID: number | string;
  Title: string;
  ImageIcon?: string;
  NumAchievements?: number;
}

interface RaAchievement {
  ID: number | string;
  Title: string;
  Description?: string;
  BadgeName?: string;
  Points?: number;
}

interface RaGameExtended {
  ID: number | string;
  Title: string;
  ImageIcon?: string;
  NumAchievements?: number;
  Achievements?: Record<string, RaAchievement>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_CDN = 'https://media.steampowered.com/steamcommunity/public/images/apps';
const STEAM_HEADER_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STEAMSPY_API = 'https://steamspy.com/api.php';
const RA_API_BASE = 'https://retroachievements.org/API';

const STEAM_DELAY_MS = 200;
const RA_DELAY_MS = 300;

const RA_CONSOLE_IDS = [7, 3, 5, 12, 2, 1, 6, 21];
const RA_GAMES_PER_CONSOLE = 125;

const PSN_USERNAMES_TO_SEED = [
  'Sorrow_Lord',
  'Neozaine',
  'Seithek',
  'Keching07',
];

const TROPHY_POINTS: Record<string, number> = {
  bronze: 15,
  silver: 30,
  gold: 90,
  platinum: 300,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSteamPoints(rarityPercent: number): number {
  const raw = Math.round((1 - rarityPercent / 100) * 100);
  return Math.max(1, Math.min(100, raw));
}

function normalizeRaPoints(points: number | undefined): number {
  return Math.min(100, Math.max(1, points ?? 1));
}

function normalizePsnPoints(trophyType: string): number {
  return TROPHY_POINTS[trophyType.toLowerCase()] ?? 15;
}

// ─── STEAM ────────────────────────────────────────────────────────────────────

async function seedSteam(prisma: PrismaClient): Promise<SeedResult> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) {
    console.log('  ⚠️  STEAM_API_KEY no configurada — sección Steam omitida');
    return { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };
  }

  console.log('\n🎮 Steam: obteniendo lista de juegos populares desde SteamSpy...');

  // Obtener top juegos desde SteamSpy (no requiere auth)
  const appIds = new Map<string, string>(); // appid → name

  // Solo listas top de SteamSpy — los endpoints genre devuelven el catálogo completo (>30k apps)
  const steamSpyRequests = [
    { request: 'top100in2weeks', label: 'top100 últimas 2 semanas' },
    { request: 'top100forever', label: 'top100 histórico' },
    { request: 'top100owned', label: 'top100 más poseídos' },
  ];

  for (const { request, label } of steamSpyRequests) {
    try {
      const resp = await axios.get<Record<string, SteamSpyEntry>>(
        `${STEAMSPY_API}?request=${request}`,
        { timeout: 15_000 },
      );
      const entries = Object.values(resp.data);
      for (const entry of entries) {
        if (entry.appid) appIds.set(String(entry.appid), entry.name ?? `Steam ${entry.appid}`);
      }
      console.log(`  ✓ ${label}: ${entries.length} apps`);
      await delay(500);
    } catch {
      console.log(`  ⚠️  ${label}: no disponible, continuando`);
    }
  }

  console.log(`  → Total apps únicas a procesar: ${appIds.size}`);

  const result: SeedResult = { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };

  let processed = 0;
  for (const [appId, appName] of appIds) {
    processed++;
    if (processed % 50 === 0) {
      console.log(`  Steam: ${processed}/${appIds.size} juegos procesados, ${result.achievementsCreated} logros guardados`);
    }

    try {
      // Obtener schema del juego (logros definidos)
      const schemaResp = await axios.get<{
        game?: { availableGameStats?: { achievements?: SteamSchemaAchievement[] } };
      }>(
        `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`,
        {
          params: { key: apiKey, appid: appId, format: 'json' },
          timeout: 10_000,
        },
      );
      await delay(STEAM_DELAY_MS);

      const achievements = schemaResp.data.game?.availableGameStats?.achievements;
      if (!achievements || achievements.length === 0) continue;

      // Obtener rareza global de cada logro
      let rarityMap = new Map<string, number>();
      try {
        const rarityResp = await axios.get<{
          achievementpercentages?: { achievements?: SteamGlobalAchievementPercentage[] };
        }>(
          `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/`,
          {
            params: { gameid: appId, format: 'json' },
            timeout: 10_000,
          },
        );
        await delay(STEAM_DELAY_MS);

        const rawRarity = rarityResp.data.achievementpercentages?.achievements ?? [];
        rarityMap = new Map(rawRarity.map((r) => [r.name, parseFloat(String(r.percent))]));
      } catch {
        // Sin rareza: continuar con puntos por defecto
      }

      // Upsert del juego en BD
      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'STEAM', externalId: appId } },
        create: {
          platform: 'STEAM',
          externalId: appId,
          title: appName,
          iconUrl: null,
          headerUrl: `${STEAM_HEADER_CDN}/${appId}/header.jpg`,
          totalAchievements: achievements.length,
        },
        update: {
          title: appName,
          totalAchievements: achievements.length,
        },
      });

      result.gamesCreated++;

      // Upsert de cada logro
      for (const ach of achievements) {
        // Steam puede devolver percent como string — forzar Float
        const rarityPercent = parseFloat(String(rarityMap.get(ach.name) ?? 100));
        const normalized = normalizeSteamPoints(rarityPercent);

        await prisma.achievement.upsert({
          where: { platform_externalId: { platform: 'STEAM', externalId: ach.name } },
          create: {
            gameId: dbGame.id,
            platform: 'STEAM',
            externalId: ach.name,
            title: ach.displayName ?? ach.name,
            description: ach.description ?? null,
            iconUrl: ach.icon ? `${STEAM_STORE_CDN}/${appId}/${ach.icon}.jpg` : null,
            rawValue: rarityPercent,
            normalizedPoints: normalized,
            rarity: rarityPercent,
            externalUrl: `https://store.steampowered.com/app/${appId}`,
          },
          update: {
            title: ach.displayName ?? ach.name,
            description: ach.description ?? null,
            rawValue: rarityPercent,
            normalizedPoints: normalized,
            rarity: rarityPercent,
          },
        });
        result.achievementsCreated++;
      }

      result.gamesProcessed++;
    } catch (err) {
      result.errors++;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status !== 403 && status !== 400) {
        const e = err as Error & { code?: string };
        console.error(`  ✗ Steam appid ${appId} | status=${status ?? 'n/a'} | type=${e.constructor?.name} | code=${e.code ?? '-'} | msg=${e.message}`);
      }
    }
  }

  console.log(`  Steam: ${processed}/${appIds.size} procesados, ${result.gamesCreated} juegos insertados, ${result.achievementsCreated} logros`);
  return result;
}

// ─── RETROACHIEVEMENTS ────────────────────────────────────────────────────────

async function seedRetroAchievements(prisma: PrismaClient): Promise<SeedResult> {
  const raUser = process.env['RA_SYSTEM_USER'];
  const raKey = process.env['RA_SYSTEM_KEY'];

  if (!raUser || !raKey) {
    console.log('  ⚠️  RA_SYSTEM_USER o RA_SYSTEM_KEY no configuradas — sección RA omitida');
    return { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };
  }

  console.log('\n🕹️  RetroAchievements: procesando 8 consolas...');

  const result: SeedResult = { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };

  const consoleNames: Record<number, string> = {
    7: 'NES', 3: 'SNES', 5: 'GBA', 12: 'PlayStation',
    2: 'N64', 1: 'Mega Drive', 6: 'Game Boy Color', 21: 'PlayStation 2',
  };

  for (const consoleId of RA_CONSOLE_IDS) {
    const consoleName = consoleNames[consoleId] ?? `Consola ${consoleId}`;
    console.log(`  → ${consoleName} (ID: ${consoleId})`);

    // Obtener lista de juegos con logros para esta consola
    let games: RaGameListEntry[] = [];
    try {
      const listResp = await axios.get<RaGameListEntry[]>(
        `${RA_API_BASE}/API_GetGameList.php`,
        {
          params: { z: raUser, y: raKey, i: consoleId, f: 1 },
          timeout: 20_000,
        },
      );
      await delay(RA_DELAY_MS);
      games = Array.isArray(listResp.data) ? listResp.data.slice(0, RA_GAMES_PER_CONSOLE) : [];
    } catch (err) {
      console.error(`  ✗ No se pudo obtener juegos de ${consoleName}: ${(err as Error).message}`);
      result.errors++;
      continue;
    }

    console.log(`     ${games.length} juegos encontrados`);

    let consoleProcessed = 0;
    for (const game of games) {
      const gameId = String(game.ID);
      consoleProcessed++;

      if (consoleProcessed % 25 === 0) {
        console.log(`     RA ${consoleName}: ${consoleProcessed}/${games.length}, ${result.achievementsCreated} logros totales`);
      }

      try {
        // Obtener datos extendidos del juego con todos sus logros
        const extResp = await axios.get<RaGameExtended>(
          `${RA_API_BASE}/API_GetGameExtended.php`,
          {
            params: { z: raUser, y: raKey, i: gameId },
            timeout: 15_000,
          },
        );
        await delay(RA_DELAY_MS);

        const gameData = extResp.data;
        if (!gameData.Achievements || Object.keys(gameData.Achievements).length === 0) continue;

        // Upsert del juego
        const dbGame = await prisma.game.upsert({
          where: { platform_externalId: { platform: 'RA', externalId: gameId } },
          create: {
            platform: 'RA',
            externalId: gameId,
            title: gameData.Title ?? game.Title ?? 'Sin título',
            iconUrl: gameData.ImageIcon
              ? `https://media.retroachievements.org${gameData.ImageIcon}`
              : null,
            headerUrl: null,
            totalAchievements: Object.keys(gameData.Achievements).length,
          },
          update: {
            title: gameData.Title ?? game.Title ?? 'Sin título',
            iconUrl: gameData.ImageIcon
              ? `https://media.retroachievements.org${gameData.ImageIcon}`
              : null,
            totalAchievements: Object.keys(gameData.Achievements).length,
          },
        });

        result.gamesCreated++;

        // Upsert de cada logro
        for (const [achKey, ach] of Object.entries(gameData.Achievements)) {
          const achId = String(ach.ID ?? achKey);
          await prisma.achievement.upsert({
            where: { platform_externalId: { platform: 'RA', externalId: achId } },
            create: {
              gameId: dbGame.id,
              platform: 'RA',
              externalId: achId,
              title: ach.Title,
              description: ach.Description ?? null,
              iconUrl: ach.BadgeName
                ? `https://media.retroachievements.org/Badge/${ach.BadgeName}.png`
                : null,
              rawValue: ach.Points ?? null,
              normalizedPoints: normalizeRaPoints(ach.Points),
              rarity: null,
              externalUrl: `https://retroachievements.org/achievement/${achId}`,
            },
            update: {
              title: ach.Title,
              description: ach.Description ?? null,
              rawValue: ach.Points ?? null,
              normalizedPoints: normalizeRaPoints(ach.Points),
              externalUrl: `https://retroachievements.org/achievement/${achId}`,
            },
          });
          result.achievementsCreated++;
        }

        result.gamesProcessed++;
      } catch (err) {
        result.errors++;
        console.error(`  ✗ RA juego ${gameId}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`  RA: ${result.gamesProcessed} juegos procesados, ${result.achievementsCreated} logros guardados`);
  return result;
}

// ─── PSN ──────────────────────────────────────────────────────────────────────

async function seedPSN(prisma: PrismaClient): Promise<SeedResult> {
  const npsso = process.env['PSN_NPSSO'];
  if (!npsso) {
    console.log('\n⏸️  PSN: PSN_NPSSO no configurada.');
    console.log('   Para obtener el NPSSO:');
    console.log('   1. Inicia sesión en https://ca.account.sony.com/api/v1/ssocookie');
    console.log('   2. El navegador muestra un JSON con el campo "npsso"');
    console.log('   3. Expórtalo: export PSN_NPSSO=<tu_npsso>');
    console.log('   4. Vuelve a ejecutar el script');
    return { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };
  }

  console.log('\n🎮 PSN: autenticando con NPSSO...');

  // Auth con NPSSO
  let auth: AuthorizationPayload;
  try {
    const code = await exchangeNpssoForAccessCode(npsso);
    const tokens = await exchangeAccessCodeForAuthTokens(code);
    auth = { accessToken: tokens.accessToken };
    console.log('  ✓ Autenticado en PSN');
  } catch (err) {
    console.error(`  ✗ Error de autenticación PSN: ${(err as Error).message}`);
    console.error('  Asegúrate de que el NPSSO es válido y no ha expirado (duración: ~60 días)');
    return { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 1 };
  }

  const result: SeedResult = { gamesProcessed: 0, gamesCreated: 0, achievementsCreated: 0, errors: 0 };

  for (const username of PSN_USERNAMES_TO_SEED) {
    console.log(`  → Procesando perfil PSN: ${username}`);

    // Resolver username → accountId
    let accountId: string;
    try {
      const profileResp = await getProfileFromUserName(auth, username);
      accountId = profileResp.profile.accountId;
      console.log(`     accountId: ${accountId}`);
    } catch (err) {
      console.error(`  ✗ No se pudo resolver el perfil de ${username}: ${(err as Error).message}`);
      result.errors++;
      continue;
    }

    // Obtener títulos del usuario
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
      console.log(`     ${titles.length} títulos encontrados`);
    } catch (err) {
      console.error(`  ✗ No se pudieron obtener títulos de ${username}: ${(err as Error).message}`);
      result.errors++;
      continue;
    }

    for (const title of titles) {
      const npCommId = title.npCommunicationId;
      const npServiceName = title.npServiceName;

      try {
        // Obtener metadatos globales de trofeos (NO datos del usuario)
        const trophiesResp = await getTitleTrophies(auth, npCommId, 'all', { npServiceName });
        const trophies: Trophy[] = trophiesResp.trophies;

        if (trophies.length === 0) continue;

        const totalAchievements =
          (title.definedTrophies.bronze ?? 0) +
          (title.definedTrophies.silver ?? 0) +
          (title.definedTrophies.gold ?? 0) +
          (title.definedTrophies.platinum ?? 0);

        // Upsert del juego (solo metadatos — sin datos de usuario)
        const dbGame = await prisma.game.upsert({
          where: { platform_externalId: { platform: 'PSN', externalId: npCommId } },
          create: {
            platform: 'PSN',
            externalId: npCommId,
            title: title.trophyTitleName,
            iconUrl: title.trophyTitleIconUrl ?? null,
            headerUrl: null,
            totalAchievements,
          },
          update: {
            title: title.trophyTitleName,
            iconUrl: title.trophyTitleIconUrl ?? null,
            totalAchievements,
          },
        });

        result.gamesCreated++;

        // Upsert de cada trofeo (solo metadatos globales — sin datos del usuario)
        for (const t of trophies) {
          const achExternalId = `${npCommId}:${t.trophyId}`;
          await prisma.achievement.upsert({
            where: { platform_externalId: { platform: 'PSN', externalId: achExternalId } },
            create: {
              gameId: dbGame.id,
              platform: 'PSN',
              externalId: achExternalId,
              title: t.trophyName ?? String(t.trophyId),
              description: t.trophyDetail ?? null,
              iconUrl: t.trophyIconUrl ?? null,
              rawValue: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
              normalizedPoints: normalizePsnPoints(t.trophyType),
              rarity: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
              externalUrl: null,
            },
            update: {
              title: t.trophyName ?? String(t.trophyId),
              description: t.trophyDetail ?? null,
              rawValue: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
              normalizedPoints: normalizePsnPoints(t.trophyType),
              rarity: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
            },
          });
          result.achievementsCreated++;
        }

        result.gamesProcessed++;
      } catch (err) {
        result.errors++;
        console.error(`  ✗ PSN título ${npCommId}: ${(err as Error).message}`);
      }
    }

    console.log(`     ${username}: ${result.gamesProcessed} juegos, ${result.achievementsCreated} logros hasta ahora`);
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Cargar .env de apps/api/ si existe (ejecutar siempre desde apps/api/)
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(envPath);
  }

  console.log('════════════════════════════════════════════════════════');
  console.log('   UnlockHub — Seed de juegos y logros populares');
  console.log('════════════════════════════════════════════════════════\n');

  // Preferir DIRECT_URL (proxy pública) sobre DATABASE_URL (red privada Railway)
  const dbUrl = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('Error: DATABASE_URL o DIRECT_URL no están configuradas.');
    console.error('Crea apps/api/.env con DATABASE_URL, STEAM_API_KEY, RA_SYSTEM_USER, RA_SYSTEM_KEY');
    process.exit(1);
  }
  // Pasar URL directamente al constructor para garantizar que usa la proxy pública
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    await prisma.$connect();
    console.log('✓ Conectado a la base de datos\n');

    const steamResult = await seedSteam(prisma);
    const raResult = await seedRetroAchievements(prisma);
    const psnResult = await seedPSN(prisma);

    const totalGames =
      steamResult.gamesCreated + raResult.gamesCreated + psnResult.gamesCreated;
    const totalAchievements =
      steamResult.achievementsCreated + raResult.achievementsCreated + psnResult.achievementsCreated;
    const totalErrors =
      steamResult.errors + raResult.errors + psnResult.errors;

    console.log('\n════════════════════════════════════════════════════════');
    console.log('   SEED COMPLETADO');
    console.log('────────────────────────────────────────────────────────');
    console.log(`   Steam:              ${steamResult.gamesCreated.toString().padStart(4)} juegos, ${steamResult.achievementsCreated.toString().padStart(6)} logros`);
    console.log(`   RetroAchievements:  ${raResult.gamesCreated.toString().padStart(4)} juegos, ${raResult.achievementsCreated.toString().padStart(6)} logros`);
    console.log(`   PSN:                ${psnResult.gamesCreated.toString().padStart(4)} juegos, ${psnResult.achievementsCreated.toString().padStart(6)} logros`);
    console.log('────────────────────────────────────────────────────────');
    console.log(`   TOTAL:              ${totalGames.toString().padStart(4)} juegos, ${totalAchievements.toString().padStart(6)} logros`);
    if (totalErrors > 0) console.log(`   Errores omitidos:   ${totalErrors}`);
    console.log('════════════════════════════════════════════════════════\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
