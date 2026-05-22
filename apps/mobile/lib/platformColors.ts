// Colores de badge de plataforma — usados en tarjetas de biblioteca, búsqueda y logros.
// Seleccionados para cumplir WCAG 2.1 AA (ratio ≥4.5:1) sobre fondos oscuros.
export const PLATFORM_COLORS: Record<string, string> = {
  STEAM: '#1b9aaa',
  RA: '#e8a838',
  XBOX: '#107c10',
  // DodgerBlue — ratio ~6.5:1 sobre fondo oscuro (supera AA)
  PSN: '#1e90ff',
};

export function getPlatformColor(platform: string, fallback = '#6b7280'): string {
  return PLATFORM_COLORS[platform] ?? fallback;
}
