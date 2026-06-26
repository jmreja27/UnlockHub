import { formatTimeAgo, formatDayMonth, formatNumber, formatFullDate } from '../../lib/formatTimeAgo';

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// t mínimo: devuelve la clave con `:count=N` para verificar qué key y qué count se pasan
const makeT = (): TFunc => (key, opts) =>
  opts?.['count'] !== undefined ? `${key}:count=${String(opts['count'])}` : key;

const NOW = new Date('2025-06-15T12:00:00.000Z').getTime();

describe('formatTimeAgo', () => {
  const t = makeT();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('< 60s → feed.just_now', () => {
    expect(formatTimeAgo(new Date(NOW - 30_000).toISOString(), t)).toBe('feed.just_now');
  });

  it('0s de diferencia → feed.just_now', () => {
    expect(formatTimeAgo(new Date(NOW).toISOString(), t)).toBe('feed.just_now');
  });

  it('59s → feed.just_now (límite inferior de minutos)', () => {
    expect(formatTimeAgo(new Date(NOW - 59_000).toISOString(), t)).toBe('feed.just_now');
  });

  it('5 minutos → feed.minutes_ago con count=5', () => {
    expect(formatTimeAgo(new Date(NOW - 5 * 60_000).toISOString(), t)).toBe('feed.minutes_ago:count=5');
  });

  it('1 minuto (singular) → feed.minutes_ago con count=1', () => {
    expect(formatTimeAgo(new Date(NOW - 90_000).toISOString(), t)).toBe('feed.minutes_ago:count=1');
  });

  it('59 minutos → feed.minutes_ago con count=59 (límite superior de minutos)', () => {
    expect(formatTimeAgo(new Date(NOW - 59 * 60_000).toISOString(), t)).toBe('feed.minutes_ago:count=59');
  });

  it('3 horas → feed.hours_ago con count=3', () => {
    expect(formatTimeAgo(new Date(NOW - 3 * 3_600_000).toISOString(), t)).toBe('feed.hours_ago:count=3');
  });

  it('1 hora (singular) → feed.hours_ago con count=1', () => {
    expect(formatTimeAgo(new Date(NOW - 61 * 60_000).toISOString(), t)).toBe('feed.hours_ago:count=1');
  });

  it('23 horas → feed.hours_ago con count=23 (límite superior de horas)', () => {
    expect(formatTimeAgo(new Date(NOW - 23 * 3_600_000).toISOString(), t)).toBe('feed.hours_ago:count=23');
  });

  it('2 días → feed.days_ago con count=2', () => {
    expect(formatTimeAgo(new Date(NOW - 2 * 86_400_000).toISOString(), t)).toBe('feed.days_ago:count=2');
  });

  it('1 día (singular) → feed.days_ago con count=1', () => {
    expect(formatTimeAgo(new Date(NOW - 25 * 3_600_000).toISOString(), t)).toBe('feed.days_ago:count=1');
  });

  it('30 días → feed.days_ago con count=30', () => {
    expect(formatTimeAgo(new Date(NOW - 30 * 86_400_000).toISOString(), t)).toBe('feed.days_ago:count=30');
  });
});

describe('formatNumber', () => {
  describe('separador ES (punto) — default y lang="es"', () => {
    it('0 → "0"', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('999 → "999" (sin separador)', () => {
      expect(formatNumber(999)).toBe('999');
    });

    it('1000 → "1.000"', () => {
      expect(formatNumber(1000)).toBe('1.000');
    });

    it('884919 → "884.919"', () => {
      expect(formatNumber(884919)).toBe('884.919');
    });

    it('1234567 → "1.234.567"', () => {
      expect(formatNumber(1234567)).toBe('1.234.567');
    });

    it('1000000 → "1.000.000"', () => {
      expect(formatNumber(1000000)).toBe('1.000.000');
    });

    it('lang="es" explícito', () => {
      expect(formatNumber(12345, 'es')).toBe('12.345');
    });

    it('lang desconocido → punto (igual que ES)', () => {
      expect(formatNumber(12345, 'fr')).toBe('12.345');
    });
  });

  describe('separador EN (coma) — lang="en"', () => {
    it('1000 → "1,000"', () => {
      expect(formatNumber(1000, 'en')).toBe('1,000');
    });

    it('884919 → "884,919"', () => {
      expect(formatNumber(884919, 'en')).toBe('884,919');
    });

    it('1234567 → "1,234,567"', () => {
      expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    });
  });

  describe('números negativos', () => {
    it('-1500 → "-1.500" (ES)', () => {
      expect(formatNumber(-1500)).toBe('-1.500');
    });

    it('-1500 → "-1,500" (EN)', () => {
      expect(formatNumber(-1500, 'en')).toBe('-1,500');
    });
  });

  describe('decimales — trunca la parte fraccionaria', () => {
    it('1500.9 → "1.500" (trunca, no redondea)', () => {
      expect(formatNumber(1500.9)).toBe('1.500');
    });
  });
});

describe('formatDayMonth', () => {
  it('formatea en español: 15 de Junio', () => {
    expect(formatDayMonth('2025-06-15', 'es')).toBe('15 de Junio');
  });

  it('formatea en inglés: June 15', () => {
    expect(formatDayMonth('2025-06-15', 'en')).toBe('June 15');
  });

  it('idioma desconocido → fallback inglés', () => {
    expect(formatDayMonth('2025-01-01', 'fr')).toBe('January 1');
  });

  it('mes 1 (Enero / January)', () => {
    expect(formatDayMonth('2025-01-08', 'es')).toBe('8 de Enero');
    expect(formatDayMonth('2025-01-08', 'en')).toBe('January 8');
  });

  it('mes 12 (Diciembre / December)', () => {
    expect(formatDayMonth('2025-12-31', 'es')).toBe('31 de Diciembre');
    expect(formatDayMonth('2025-12-31', 'en')).toBe('December 31');
  });

  it('día 1 (singular)', () => {
    expect(formatDayMonth('2025-03-01', 'en')).toBe('March 1');
    expect(formatDayMonth('2025-03-01', 'es')).toBe('1 de Marzo');
  });
});

describe('formatFullDate', () => {
  it('ISO datetime completo → DD/MM/AAAA', () => {
    expect(formatFullDate('2026-06-25T10:30:00.000Z')).toBe('25/06/2026');
  });

  it('fecha plana YYYY-MM-DD → DD/MM/AAAA', () => {
    expect(formatFullDate('2026-06-25')).toBe('25/06/2026');
  });

  it('día y mes de un dígito → cero a la izquierda', () => {
    expect(formatFullDate('2026-01-05T00:00:00.000Z')).toBe('05/01/2026');
  });

  it('fin de año (31/12)', () => {
    expect(formatFullDate('2025-12-31T23:59:59.000Z')).toBe('31/12/2025');
  });

  it('inicio de año siguiente (01/01)', () => {
    expect(formatFullDate('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
  });

  it('preserva el año de la fecha, no la fecha local del dispositivo', () => {
    expect(formatFullDate('2024-03-15T00:00:00.000Z')).toBe('15/03/2024');
  });
});
