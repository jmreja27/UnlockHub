import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import type { GameSearchResult, UserSearchResult, SearchResponse } from '@unlockhub/types';

const MAX_RESULTS = 20;
// Si la DB local tiene menos de este número de juegos para una query,
// se enriquece con resultados de APIs externas
const LOCAL_THRESHOLD = 10;

const STEAM_SEARCH_CACHE_TTL = 3600; // 1 hora

export async function search(
  query: string,
  type: 'all' | 'games' | 'users',
): Promise<SearchResponse> {
  const q = query.trim();

  const [games, users] = await Promise.all([
    type !== 'users' ? searchGames(q) : Promise.resolve([]),
    type !== 'games' ? searchUsers(q) : Promise.resolve([]),
  ]);

  return { games, users, total: games.length + users.length };
}

async function searchGames(q: string): Promise<GameSearchResult[]> {
  const localRows = await prisma.game.findMany({
    where: { title: { contains: q, mode: 'insensitive' } },
    select: { id: true, platform: true, externalId: true, title: true, iconUrl: true, totalAchievements: true },
    orderBy: { title: 'asc' },
    take: MAX_RESULTS,
  });

  const localResults: GameSearchResult[] = localRows.map((r) => ({
    type: 'game' as const,
    id: r.id,
    platform: r.platform,
    title: r.title,
    iconUrl: r.iconUrl,
    totalAchievements: r.totalAchievements,
  }));

  if (localResults.length >= LOCAL_THRESHOLD) {
    return localResults;
  }

  // Enriquecer con Steam cuando la DB local tiene pocos resultados
  const steamResults = await searchSteamExternal(q);

  // Deduplicar: ignorar juegos que ya están en la DB local
  const localExternalIds = new Set(localRows.map((r) => r.externalId));
  const newSteamResults = steamResults.filter((r) => !localExternalIds.has(r.steamId));

  if (newSteamResults.length === 0) {
    return localResults;
  }

  // Guardar los juegos de Steam como registros "shell" en la DB para que
  // el tap en GameCard pueda navegar a /game/[id]. Se sobreescriben con
  // datos reales en el primer sync del usuario.
  const shellGames = await upsertShellGames(newSteamResults);

  const externalResults: GameSearchResult[] = shellGames.map((g) => ({
    type: 'game' as const,
    id: g.id,
    platform: 'STEAM' as const,
    title: g.title,
    iconUrl: g.iconUrl,
    totalAchievements: g.totalAchievements,
  }));

  return [...localResults, ...externalResults].slice(0, MAX_RESULTS);
}

// ─── Steam Store Search (sin API key) ─────────────────────────────────────────

interface SteamSearchItem {
  steamId: string;
  title: string;
  iconUrl: string | null;
}

interface SteamStoreSearchResponse {
  total: number;
  items: Array<{ id: number; name: string; tiny_image: string }>;
}

async function searchSteamExternal(q: string): Promise<SteamSearchItem[]> {
  const cacheKey = `search:steam:${q.toLowerCase()}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SteamSearchItem[];
    }
  } catch {
    // Si Redis falla, continuar sin caché
  }

  try {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=en&cc=US`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as SteamStoreSearchResponse;
    const items: SteamSearchItem[] = (data.items ?? []).slice(0, MAX_RESULTS).map((item) => ({
      steamId: String(item.id),
      title: item.name,
      iconUrl: item.tiny_image ?? null,
    }));

    // Cachear resultado en Redis
    try {
      await redis.set(cacheKey, JSON.stringify(items), 'EX', STEAM_SEARCH_CACHE_TTL);
    } catch {
      // Redis falla silenciosamente
    }

    return items;
  } catch {
    // Error de red o timeout: devolver vacío sin romper el search
    return [];
  }
}

async function upsertShellGames(
  items: SteamSearchItem[],
): Promise<Array<{ id: string; title: string; iconUrl: string | null; totalAchievements: number }>> {
  const results: Array<{ id: string; title: string; iconUrl: string | null; totalAchievements: number }> = [];

  for (const item of items) {
    const game = await prisma.game.upsert({
      where: { platform_externalId: { platform: 'STEAM', externalId: item.steamId } },
      update: {
        title: item.title,
        iconUrl: item.iconUrl,
      },
      create: {
        platform: 'STEAM',
        externalId: item.steamId,
        title: item.title,
        iconUrl: item.iconUrl,
        totalAchievements: 0,
      },
      select: { id: true, title: true, iconUrl: true, totalAchievements: true },
    });
    results.push(game);
  }

  return results;
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const rows = await prisma.user.findMany({
    where: { username: { contains: q, mode: 'insensitive' } },
    select: { id: true, username: true, avatar: true, level: true, xp: true },
    orderBy: { username: 'asc' },
    take: MAX_RESULTS,
  });

  return rows.map((r) => ({
    type: 'user' as const,
    id: r.id,
    username: r.username,
    avatar: r.avatar,
    level: r.level,
    xp: r.xp,
  }));
}

// ─── Game detail ──────────────────────────────────────────────────────────────

export async function getGameWithAchievements(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: {
      achievements: {
        orderBy: [{ rarity: 'asc' }, { normalizedPoints: 'desc' }],
      },
    },
  });
}
