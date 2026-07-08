/**
 * Curva unificada de normalización de XP por rareza — usada por Steam y PSN.
 * F46 Fase 1 (Opción A, 2026-07-08): sin multiplicador de tipo, curva de rareza pura,
 * misma dificultad = mismo XP base en ambas plataformas.
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
