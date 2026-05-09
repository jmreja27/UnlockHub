import { prisma } from '../lib/prisma';
import type { GameSearchResult, UserSearchResult, SearchResponse } from '@unlockhub/types';

const MAX_PER_TYPE = 20;

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
  const rows = await prisma.game.findMany({
    where: { title: { contains: q, mode: 'insensitive' } },
    select: { id: true, platform: true, title: true, iconUrl: true, totalAchievements: true },
    orderBy: { title: 'asc' },
    take: MAX_PER_TYPE,
  });

  return rows.map((r) => ({
    type: 'game' as const,
    id: r.id,
    platform: r.platform,
    title: r.title,
    iconUrl: r.iconUrl,
    totalAchievements: r.totalAchievements,
  }));
}

async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const rows = await prisma.user.findMany({
    where: { username: { contains: q, mode: 'insensitive' } },
    select: { id: true, username: true, avatar: true, level: true, xp: true },
    orderBy: { username: 'asc' },
    take: MAX_PER_TYPE,
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
