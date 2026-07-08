import { normalizeAchievementPoints } from './achievement-points';

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
