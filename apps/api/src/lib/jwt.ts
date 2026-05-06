import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  isPremium: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const secret = process.env['JWT_ACCESS_SECRET'];
  const expiresIn = process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m';
  if (!secret) throw new Error('JWT_ACCESS_SECRET no configurado');
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env['JWT_ACCESS_SECRET'];
  if (!secret) throw new Error('JWT_ACCESS_SECRET no configurado');
  return jwt.verify(token, secret) as AccessTokenPayload;
}

export function signRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiry(): Date {
  const days = 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
