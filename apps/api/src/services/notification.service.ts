import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

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

async function sendToExpo(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Expo Push API error: ${text}`, 'PUSH_API_ERROR', 502);
  }
  const json = (await res.json()) as { data: ExpoPushTicket[] };
  const failed = json.data.filter((t) => t.status === 'error');
  if (failed.length > 0) {
    console.warn('[notification] Tokens con error:', failed.map((t) => t.message).join(', '));
  }
}

export async function saveDeviceToken(userId: string, token: string, platform: string): Promise<void> {
  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
}

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
  const messages: ExpoPushMessage[] = tokens.map((t) => ({ to: t.token, title, body, data }));
  await sendToExpo(messages);
}
