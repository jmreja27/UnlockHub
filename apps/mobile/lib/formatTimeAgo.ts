type TFunc = (key: string, opts?: Record<string, unknown>) => string;

export const MONTH_NAMES: Record<string, string[]> = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

// Tiempo relativo sin Intl.RelativeTimeFormat — no disponible en todos los builds de Hermes.
export function formatTimeAgo(isoDate: string, t: TFunc): string {
  const diffSeconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diffSeconds < 60) return t('feed.just_now');
  const diffMin = Math.floor(diffSeconds / 60);
  if (diffMin < 60) return t('feed.minutes_ago', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('feed.hours_ago', { count: diffH });
  return t('feed.days_ago', { count: Math.floor(diffH / 24) });
}

// Formatea un número con separadores de miles sin Intl.NumberFormat ni toLocaleString —
// ambas APIs pueden lanzar excepción en builds de Hermes donde Intl no está compilado
// (crash documentado en Sentry: Intl.RelativeTimeFormat undefined en dispositivos de testers).
// ES (o lang desconocido): punto como separador ("884.919"). EN: coma ("884,919").
export function formatNumber(n: number, lang?: string): string {
  const sep = lang === 'en' ? ',' : '.';
  const int = Math.trunc(n);
  // eslint-disable-next-line security/detect-unsafe-regex -- input siempre es dígitos de Math.abs(int).toString(), sin entrada de usuario
  const formatted = Math.abs(int).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return int < 0 ? `-${formatted}` : formatted;
}

// Formatea un objeto Date como "DD/MM/AAAA" sin Intl.DateTimeFormat.
// Igual motivo que las demás utilidades: Hermes no garantiza soporte Intl en todos los builds.
export function formatBirthDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Formatea una fecha "YYYY-MM-DD" como "15 de Junio" (es) o "June 15" (en)
// sin Intl.DateTimeFormat, que no está garantizado en todos los builds de Hermes.
export function formatDayMonth(dateStr: string, lang: string): string {
  const parts = dateStr.split('-');
  const monthIndex = parseInt(parts[1] ?? '1', 10) - 1;
  const day = parseInt(parts[2] ?? '1', 10);
  const names = MONTH_NAMES[lang] ?? MONTH_NAMES['en']!;
  const month = names[monthIndex] ?? '';
  return lang === 'es' ? `${day} de ${month}` : `${month} ${day}`;
}
