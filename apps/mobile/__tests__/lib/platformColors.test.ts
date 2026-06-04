import { PLATFORM_COLORS, getPlatformColor } from '../../lib/platformColors';

describe('PLATFORM_COLORS', () => {
  it('define el color de Steam', () => {
    expect(PLATFORM_COLORS['STEAM']).toBe('#1b9aaa');
  });

  it('define el color de RetroAchievements', () => {
    expect(PLATFORM_COLORS['RA']).toBe('#e8a838');
  });

  it('define el color de Xbox', () => {
    expect(PLATFORM_COLORS['XBOX']).toBe('#107c10');
  });

  it('define el color de PSN como #1e90ff (DodgerBlue, contraste WCAG AA)', () => {
    expect(PLATFORM_COLORS['PSN']).toBe('#1e90ff');
  });
});

describe('getPlatformColor', () => {
  it('devuelve el color correcto para plataformas conocidas', () => {
    expect(getPlatformColor('STEAM')).toBe('#1b9aaa');
    expect(getPlatformColor('RA')).toBe('#e8a838');
    expect(getPlatformColor('XBOX')).toBe('#107c10');
    expect(getPlatformColor('PSN')).toBe('#1e90ff');
  });

  it('devuelve el fallback por defecto (#6b7280) para plataformas desconocidas', () => {
    expect(getPlatformColor('UNKNOWN')).toBe('#6b7280');
  });

  it('devuelve el fallback personalizado para plataformas desconocidas', () => {
    expect(getPlatformColor('UNKNOWN', '#ff0000')).toBe('#ff0000');
  });
});
