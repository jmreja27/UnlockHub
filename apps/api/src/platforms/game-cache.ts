import { redis } from '../lib/redis';

// TTL de 24h — título, iconUrl, totalAchievements y console cambian raramente.
// Si cambian, el valor en BD se actualiza en el próximo sync tras que expire la clave.
const GAME_META_TTL = 86400;

export interface CachedGameMeta {
  id: string;
  title: string;
  iconUrl: string | null;
  totalAchievements: number;
  console: string | null;
}

function gameMetaKey(platform: string, externalId: string): string {
  return `game:meta:${platform}:${externalId}`;
}

/**
 * Devuelve los metadatos cacheados de un juego o null si no hay entrada válida.
 */
export async function getCachedGameMeta(
  platform: string,
  externalId: string,
): Promise<CachedGameMeta | null> {
  const raw = await redis.get(gameMetaKey(platform, externalId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedGameMeta;
  } catch {
    return null;
  }
}

/**
 * Persiste los metadatos de un juego en Redis con TTL de 24h.
 * Llamar inmediatamente después del game.upsert en cada adapter.
 */
export async function setCachedGameMeta(
  platform: string,
  externalId: string,
  meta: CachedGameMeta,
): Promise<void> {
  await redis.setex(gameMetaKey(platform, externalId), GAME_META_TTL, JSON.stringify(meta));
}
