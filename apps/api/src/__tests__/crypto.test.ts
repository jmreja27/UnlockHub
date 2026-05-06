import { encrypt, decrypt } from '../lib/crypto';

beforeEach(() => {
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
});

describe('encrypt / decrypt', () => {
  it('round-trip: el texto descifrado coincide con el original', () => {
    const plaintext = 'mi-api-key-secreta';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('preserva caracteres especiales y unicode', () => {
    const plaintext = '🎮 Clave con ñ y 日本語';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produce valores distintos en cada llamada (IV aleatorio)', () => {
    const a = encrypt('mismo-texto');
    const b = encrypt('mismo-texto');
    expect(a).not.toBe(b);
    // Pero ambos se descifran al mismo texto
    expect(decrypt(a)).toBe('mismo-texto');
    expect(decrypt(b)).toBe('mismo-texto');
  });

  it('lanza error si ENCRYPTION_KEY no tiene 64 caracteres hex', () => {
    process.env['ENCRYPTION_KEY'] = 'clave-demasiado-corta';
    expect(() => encrypt('texto')).toThrow('ENCRYPTION_KEY');
  });

  it('lanza error si ENCRYPTION_KEY contiene caracteres no hexadecimales', () => {
    process.env['ENCRYPTION_KEY'] = 'z'.repeat(64); // 'z' no es hex válido
    expect(() => encrypt('texto')).toThrow('ENCRYPTION_KEY');
  });

  it('lanza error al descifrar texto inválido', () => {
    expect(() => decrypt('no-es-hex-valido')).toThrow();
  });
});
