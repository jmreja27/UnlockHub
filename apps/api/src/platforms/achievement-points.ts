/**
 * Curva unificada de normalización de XP por rareza — usada por Steam (siempre)
 * y por PSN cuando hay rareza real disponible (ver normalizePsnAchievementPoints).
 *
 * RA queda fuera deliberadamente — no expone un % de jugadores comparable
 * (usa su propio sistema de puntos 1-500, ver retroachievements.adapter.ts).
 *
 * Fallback: rareza null/NaN/fuera de [0,100] se trata como "común" (100%),
 * igual que el comportamiento previo de Steam — nunca lanza, nunca da 0.
 */
export function normalizeAchievementPoints(rarityPercent: number | null | undefined): number {
  const valid =
    typeof rarityPercent === 'number' &&
    !isNaN(rarityPercent) &&
    rarityPercent >= 0 &&
    rarityPercent <= 100;
  const rarity = valid ? rarityPercent : 100;

  if (rarity <= 1) return 150;
  if (rarity <= 5) return 100;
  if (rarity <= 10) return 60;
  if (rarity <= 20) return 35;
  if (rarity <= 50) return 15;
  return 5;
}

export type PsnTrophyType = 'bronze' | 'silver' | 'gold' | 'platinum';

/**
 * XP por tipo de trofeo — fallback de PSN cuando no hay rareza real disponible
 * (el caso siempre hoy: psn-api no devuelve `trophyEarnedRate` de forma fiable,
 * ver nota en CLAUDE.md sección PSN). Recalibrado en F46 para no exceder el techo
 * de la curva de rareza de Steam (150) — un Platino común ya no vale el doble
 * que el logro Steam más raro.
 */
const PSN_TROPHY_TYPE_POINTS: Record<PsnTrophyType, number> = {
  bronze: 10,
  silver: 20,
  gold: 50,
  platinum: 100,
};

/**
 * XP de PSN — F46 Opción A confirmada (2026-07-08): rareza real no es viable con
 * psn-api (no se devuelve de forma fiable), así que el cálculo cae al tipo de trofeo.
 *
 * La costura para Opción B futura: si en algún momento se obtiene `trophyEarnedRate`
 * por otra vía y se pasa un `rarityPercent` válido, esta función usa la MISMA curva
 * de rareza que Steam (`normalizeAchievementPoints`) en lugar del tipo de trofeo —
 * sin tocar esta función de nuevo. Hoy `rarityPercent` siempre llega `null`/`NaN`
 * desde `psn.adapter.ts`, así que siempre cae al fallback por tipo.
 */
export function normalizePsnAchievementPoints(
  rarityPercent: number | null | undefined,
  trophyType: PsnTrophyType,
): number {
  const hasRarity =
    typeof rarityPercent === 'number' && !isNaN(rarityPercent) && rarityPercent >= 0 && rarityPercent <= 100;

  if (hasRarity) return normalizeAchievementPoints(rarityPercent);
  return PSN_TROPHY_TYPE_POINTS[trophyType];
}
