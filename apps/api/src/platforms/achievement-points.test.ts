import { normalizeAchievementPoints, normalizePsnAchievementPoints } from './achievement-points';

describe('normalizeAchievementPoints — curva de rareza F46 Fase 1 (Opción A, sin multiplicador)', () => {
  it('rareza ≤1% → 150 (ultra raro)', () => {
    expect(normalizeAchievementPoints(0)).toBe(150);
    expect(normalizeAchievementPoints(0.3)).toBe(150);
    expect(normalizeAchievementPoints(1)).toBe(150);
  });

  it('rareza ≤5% → 100', () => {
    expect(normalizeAchievementPoints(1.1)).toBe(100);
    expect(normalizeAchievementPoints(2.9)).toBe(100);
    expect(normalizeAchievementPoints(5)).toBe(100);
  });

  it('rareza ≤10% → 60', () => {
    expect(normalizeAchievementPoints(5.1)).toBe(60);
    expect(normalizeAchievementPoints(7.5)).toBe(60);
    expect(normalizeAchievementPoints(10)).toBe(60);
  });

  it('rareza ≤20% → 35', () => {
    expect(normalizeAchievementPoints(10.1)).toBe(35);
    expect(normalizeAchievementPoints(15)).toBe(35);
    expect(normalizeAchievementPoints(20)).toBe(35);
  });

  it('rareza ≤50% → 15', () => {
    expect(normalizeAchievementPoints(20.1)).toBe(15);
    expect(normalizeAchievementPoints(35)).toBe(15);
    expect(normalizeAchievementPoints(50)).toBe(15);
  });

  it('rareza >50% → 5 (común)', () => {
    expect(normalizeAchievementPoints(50.1)).toBe(5);
    expect(normalizeAchievementPoints(75.5)).toBe(5);
    expect(normalizeAchievementPoints(100)).toBe(5);
  });

  describe('bordes exactos entre escalones', () => {
    it('1.0% cae en el escalón ≤1% (150), no en ≤5%', () => {
      expect(normalizeAchievementPoints(1.0)).toBe(150);
    });

    it('5.0% cae en el escalón ≤5% (100), no en ≤10%', () => {
      expect(normalizeAchievementPoints(5.0)).toBe(100);
    });

    it('10.0% cae en el escalón ≤10% (60), no en ≤20%', () => {
      expect(normalizeAchievementPoints(10.0)).toBe(60);
    });

    it('20.0% cae en el escalón ≤20% (35), no en ≤50%', () => {
      expect(normalizeAchievementPoints(20.0)).toBe(35);
    });

    it('50.0% cae en el escalón ≤50% (15), no en >50%', () => {
      expect(normalizeAchievementPoints(50.0)).toBe(15);
    });
  });

  describe('fallback — rareza ausente o inválida', () => {
    it('rareza null → fallback razonable (5, no 0, no lanza)', () => {
      expect(normalizeAchievementPoints(null)).toBe(5);
    });

    it('rareza undefined → fallback razonable (5, no 0, no lanza)', () => {
      expect(normalizeAchievementPoints(undefined)).toBe(5);
    });

    it('rareza NaN → fallback razonable (5, no 0, no lanza)', () => {
      expect(normalizeAchievementPoints(NaN)).toBe(5);
    });

    it('rareza negativa (fuera de rango) → fallback (5)', () => {
      expect(normalizeAchievementPoints(-5)).toBe(5);
    });

    it('rareza > 100 (fuera de rango) → fallback (5)', () => {
      expect(normalizeAchievementPoints(150)).toBe(5);
    });
  });

  describe('unificación cross-plataforma', () => {
    it('la misma rareza produce el mismo XP base sin importar la plataforma de origen (Steam/PSN)', () => {
      const rarity = 3.2;
      const fromSteamCallSite = normalizeAchievementPoints(rarity);
      const fromPsnCallSite = normalizeAchievementPoints(rarity);
      expect(fromSteamCallSite).toBe(fromPsnCallSite);
      expect(fromSteamCallSite).toBe(100);
    });
  });
});

describe('normalizePsnAchievementPoints — F46 Opción A confirmada (fallback por tipo + costura de rareza futura)', () => {
  describe('caso actual — sin rareza (psn-api no la devuelve de forma fiable) → fallback por tipo de trofeo', () => {
    it('bronze → 10', () => {
      expect(normalizePsnAchievementPoints(null, 'bronze')).toBe(10);
      expect(normalizePsnAchievementPoints(undefined, 'bronze')).toBe(10);
      expect(normalizePsnAchievementPoints(NaN, 'bronze')).toBe(10);
    });

    it('silver → 20', () => {
      expect(normalizePsnAchievementPoints(null, 'silver')).toBe(20);
    });

    it('gold → 50', () => {
      expect(normalizePsnAchievementPoints(null, 'gold')).toBe(50);
    });

    it('platinum → 100 (no excede el techo de Steam, 150)', () => {
      expect(normalizePsnAchievementPoints(null, 'platinum')).toBe(100);
    });

    it('rareza fuera de rango (negativa o >100) también cae al fallback por tipo', () => {
      expect(normalizePsnAchievementPoints(-5, 'gold')).toBe(50);
      expect(normalizePsnAchievementPoints(150, 'gold')).toBe(50);
    });
  });

  describe('costura Opción B futura — si llega rareza real, usa la curva de Steam en lugar del tipo', () => {
    it('rareza válida ignora el trophyType y aplica la misma curva que Steam', () => {
      expect(normalizePsnAchievementPoints(0.5, 'bronze')).toBe(150);
      expect(normalizePsnAchievementPoints(3, 'bronze')).toBe(100);
      expect(normalizePsnAchievementPoints(8, 'silver')).toBe(60);
      expect(normalizePsnAchievementPoints(15, 'gold')).toBe(35);
      expect(normalizePsnAchievementPoints(40, 'platinum')).toBe(15);
      expect(normalizePsnAchievementPoints(75, 'platinum')).toBe(5);
    });

    it('un platino raro (rareza real ≤1%) vale lo mismo que un logro Steam igual de raro', () => {
      const rarity = 0.8;
      expect(normalizePsnAchievementPoints(rarity, 'platinum')).toBe(normalizeAchievementPoints(rarity));
    });

    it('bordes exactos de rareza se respetan igual que en Steam (0 y 100)', () => {
      expect(normalizePsnAchievementPoints(0, 'bronze')).toBe(150);
      expect(normalizePsnAchievementPoints(100, 'bronze')).toBe(5);
    });
  });
});
