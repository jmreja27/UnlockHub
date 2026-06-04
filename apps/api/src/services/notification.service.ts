import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

const EXPO_TIMEOUT_MS = 10_000;

/**
 * Envía mensajes push a la Expo Push API en un solo request.
 * La Expo Push API acepta hasta 100 mensajes por request — ver sendAll/sendBulk para batching.
 * Timeout de 10s para evitar colgar indefinidamente si Expo no responde.
 * @throws {AppError} PUSH_API_ERROR (502) si la API de Expo devuelve un error HTTP.
 */
async function sendToExpo(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXPO_TIMEOUT_MS);

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(`Expo Push API error: ${text}`, 'PUSH_API_ERROR', 502);
    }
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    const tickets = json.data;
    if (!Array.isArray(tickets)) {
      logger.warn({ json }, '[notification] Respuesta inesperada de Expo Push API');
      return;
    }
    const failed = tickets.filter((t) => t.status === 'error');
    if (failed.length > 0) {
      logger.warn({ errors: failed.map((t) => t.message) }, '[notification] Tokens con error');
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Registra o actualiza el token de dispositivo para push notifications.
 * Hace upsert por token (clave única) — si el token cambia de usuario, se reasigna.
 */
export async function saveDeviceToken(userId: string, token: string, platform: string): Promise<void> {
  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

/** Elimina un token de dispositivo específico del usuario (ej: logout). */
export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
}

/**
 * Envía una push notification a todos los dispositivos registrados de un usuario.
 * Si el usuario no tiene tokens registrados, la función retorna sin error.
 */
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  const messages: ExpoPushMessage[] = tokens.map((t) => ({ to: t.token, title, body, data }));
  await sendToExpo(messages);
}

/**
 * Envía una push notification broadcast a TODOS los dispositivos registrados.
 * Procesa en lotes de 100 (límite de la Expo Push API).
 * Usar con cuidado — puede generar muchas llamadas HTTP si hay muchos usuarios.
 */
export async function sendAll(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({ select: { token: true } });
  // Expo limita a 100 mensajes por request — procesar en lotes
  const BATCH_SIZE = 100;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const messages: ExpoPushMessage[] = batch.map((t) => ({ to: t.token, title, body, data }));
    await sendToExpo(messages);
  }
}

/**
 * Envía una push notification a un subconjunto de usuarios por ID.
 * Procesa en lotes de 100 (límite de la Expo Push API).
 * Retorna inmediatamente si userIds está vacío.
 */
export async function sendBulk(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return;
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  const BATCH_SIZE = 100;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const messages: ExpoPushMessage[] = batch.map((t) => ({ to: t.token, title, body, data }));
    await sendToExpo(messages);
  }
}
