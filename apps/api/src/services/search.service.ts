import type { GameSearchResult, UserSearchResult, AchievementSearchResult, SearchResponse } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const MAX_RESULTS = 20;
// Si la DB local tiene menos de este número de juegos para una query,
// se enriquece con resultados de APIs externas
const LOCAL_THRESHOLD = 10;

const STEAM_SEARCH_CACHE_TTL = 3600; // 1 hora

export async function search(
  query: string,
  type: 'all' | 'games' | 'users' | 'achievements',
  platform?: string,
  userId?: string,
  page: number = 1,
): Promise<SearchResponse> {
  const q = query.trim();

  const [games, users, achievements] = await Promise.all([
    type !== 'users' && type !== 'achievements' ? searchGames(q) : Promise.resolve([]),
    type !== 'games' && type !== 'achievements' ? searchUsers(q) : Promise.resolve([]),
    type === 'achievements' ? searchAchievements(q, platform, userId, page) : Promise.resolve([]),
  ]);

  return { games, users, achievements, total: games.length + users.length + achievements.length };
}

async function searchGames(q: string): Promise<GameSearchResult[]> {
  const localRows = await prisma.game.findMany({
    where: { title: { contains: q, mode: 'insensitive' } },
    select: { id: true, platform: true, externalId: true, title: true, console: true, iconUrl: true, totalAchievements: true },
    orderBy: { title: 'asc' },
    take: MAX_RESULTS,
  });

  const localResults: GameSearchResult[] = localRows.map((r) => ({
    type: 'game' as const,
    id: r.id,
    platform: r.platform,
    title: r.title,
    console: r.console,
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
    console: null,
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

// ─── Achievement search ───────────────────────────────────────────────────────

async function searchAchievements(
  query: string,
  platform?: string,
  userId?: string,
  page: number = 1,
): Promise<AchievementSearchResult[]> {
  const limit = MAX_RESULTS;
  const skip = (page - 1) * limit;

  const achievementRows = await prisma.achievement.findMany({
    where: {
      title: { contains: query, mode: 'insensitive' },
      // Xbox está gateado hasta Fase 4 — nunca aparece en búsqueda
      NOT: { platform: 'XBOX' },
      ...(platform && platform !== 'XBOX' ? { platform: platform as 'STEAM' | 'RA' | 'PSN' } : {}),
    },
    select: {
      id: true,
      title: true,
      description: true,
      iconUrl: true,
      rarity: true,
      normalizedPoints: true,
      platform: true,
      game: { select: { id: true, title: true, iconUrl: true } },
    },
    orderBy: [{ rarity: 'asc' }, { normalizedPoints: 'desc' }],
    take: limit,
    skip,
  });

  const earnedMap = new Map<string, string>();
  if (userId && achievementRows.length > 0) {
    const achievementIds = achievementRows.map((a) => a.id);
    const earned = await prisma.userAchievement.findMany({
      where: { userId, achievementId: { in: achievementIds } },
      select: { achievementId: true, unlockedAt: true },
    });
    earned.forEach((e) => earnedMap.set(e.achievementId, e.unlockedAt.toISOString()));
  }

  return achievementRows.map((a) => ({
    type: 'achievement' as const,
    id: a.id,
    title: a.title,
    description: a.description,
    iconUrl: a.iconUrl,
    rarity: a.rarity,
    normalizedPoints: a.normalizedPoints,
    platform: a.platform,
    game: { id: a.game.id, title: a.game.title, iconUrl: a.game.iconUrl },
    isUnlocked: earnedMap.has(a.id),
    unlockedAt: earnedMap.get(a.id) ?? null,
  }));
}

// ─── Game achievements con estado de desbloqueo del usuario ───────────────────

interface AchievementWithStatus {
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rarity: number | null;
  normalizedPoints: number;
  platform: string;
  externalId: string;
  externalUrl: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

interface GameAchievementsResponse {
  achievements: AchievementWithStatus[];
  earnedCount: number;
  totalCount: number;
}

export async function getGameAchievementsWithStatus(
  gameId: string,
  userId?: string,
): Promise<GameAchievementsResponse | null> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) return null;

  const achievementRows = await prisma.achievement.findMany({
    where: { gameId },
    orderBy: [{ rarity: 'asc' }, { normalizedPoints: 'desc' }],
  });

  const earnedMap = new Map<string, string>();
  if (userId && achievementRows.length > 0) {
    const earned = await prisma.userAchievement.findMany({
      where: { userId, achievementId: { in: achievementRows.map((a) => a.id) } },
      select: { achievementId: true, unlockedAt: true },
    });
    earned.forEach((e) => earnedMap.set(e.achievementId, e.unlockedAt.toISOString()));
  }

  const achievements: AchievementWithStatus[] = achievementRows.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    iconUrl: a.iconUrl,
    rarity: a.rarity,
    normalizedPoints: a.normalizedPoints,
    platform: a.platform,
    externalId: a.externalId,
    externalUrl: a.externalUrl,
    isUnlocked: earnedMap.has(a.id),
    unlockedAt: earnedMap.get(a.id) ?? null,
  }));

  return { achievements, earnedCount: earnedMap.size, totalCount: achievementRows.length };
}
