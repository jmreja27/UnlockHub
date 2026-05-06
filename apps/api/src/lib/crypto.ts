import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'] ?? '';
  if (hex.length !== 64) throw new Error('ENCRYPTION_KEY debe ser una clave hex de 64 caracteres');
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: iv(12) + tag(16) + ciphertext — todo en hex
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'hex');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
