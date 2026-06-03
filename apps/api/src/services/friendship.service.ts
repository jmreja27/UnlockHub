import type { Friendship, FriendshipStatusResult, PaginatedResponse } from '@unlockhub/types';

import { friendshipRepository } from '../repositories/friendship.repository';
import { findUserByUsername } from '../repositories/user.repository';
import { AppError } from '../middleware/errorHandler';

import { createEvent } from './activity.service';

/** Transforma una fila de Prisma al DTO Friendship del tipo compartido. */
function toFriendshipDto(row: {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sender?: { id: string; username: string; avatar: string | null; level: number; xp: number };
  receiver?: { id: string; username: string; avatar: string | null; level: number; xp: number };
}): Friendship {
  return {
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    status: row.status as Friendship['status'],
    createdAt: row.createdAt.toISOString(),
    sender: row.sender ?? undefined,
    receiver: row.receiver ?? undefined,
  };
}

/**
 * Envía una solicitud de amistad del sender al receiver.
 * @throws {AppError} SELF_FRIEND_REQUEST (400) si sender === receiver.
 * @throws {AppError} ALREADY_FRIENDS (409) si ya son amigos.
 * @throws {AppError} REQUEST_ALREADY_SENT (409) si ya existe solicitud pendiente.
 * @throws {AppError} REQUEST_BLOCKED (403) si el receiver ha bloqueado al sender.
 */
export async function sendFriendRequest(senderId: string, receiverId: string): Promise<Friendship> {
  if (senderId === receiverId) {
    throw new AppError('No puedes enviarte una solicitud a ti mismo.', 'SELF_FRIEND_REQUEST', 400);
  }

  const existing = await friendshipRepository.findBetween(senderId, receiverId);
  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new AppError('Ya sois amigos.', 'ALREADY_FRIENDS', 409);
    }
    if (existing.status === 'PENDING') {
      throw new AppError('Ya existe una solicitud de amistad pendiente.', 'REQUEST_ALREADY_SENT', 409);
    }
    if (existing.status === 'BLOCKED') {
      throw new AppError('No se puede enviar la solicitud.', 'REQUEST_BLOCKED', 403);
    }
  }

  const friendship = await friendshipRepository.create(senderId, receiverId);
  return toFriendshipDto(friendship);
}

/**
 * Acepta una solicitud de amistad pendiente.
 * Emite eventos de actividad FRIEND_ADDED para ambos usuarios (fire-and-forget).
 * @throws {AppError} FRIENDSHIP_NOT_FOUND (404) si el friendshipId no existe.
 * @throws {AppError} FORBIDDEN (403) si el userId no es el receiver de la solicitud.
 * @throws {AppError} INVALID_STATUS (409) si la solicitud no está en estado PENDING.
 */
export async function acceptFriendRequest(friendshipId: string, userId: string): Promise<Friendship> {
  const friendship = await friendshipRepository.findById(friendshipId);

  if (!friendship) {
    throw new AppError('Solicitud no encontrada.', 'FRIENDSHIP_NOT_FOUND', 404);
  }
  if (friendship.receiverId !== userId) {
    throw new AppError('No tienes permiso para aceptar esta solicitud.', 'FORBIDDEN', 403);
  }
  if (friendship.status !== 'PENDING') {
    throw new AppError('La solicitud no está pendiente.', 'INVALID_STATUS', 409);
  }

  const updated = await friendshipRepository.updateStatus(friendshipId, 'ACCEPTED');

  // Emitir evento de actividad para ambos usuarios (fire-and-forget)
  void Promise.all([
    createEvent(userId, 'FRIEND_ADDED', { friendId: friendship.senderId }),
    createEvent(friendship.senderId, 'FRIEND_ADDED', { friendId: userId }),
  ]);

  return toFriendshipDto(updated);
}

/**
 * Rechaza y elimina una solicitud de amistad pendiente.
 * Solo el receiver puede rechazar.
 * @throws {AppError} FRIENDSHIP_NOT_FOUND (404), FORBIDDEN (403) o INVALID_STATUS (409).
 */
export async function rejectFriendRequest(friendshipId: string, userId: string): Promise<void> {
  const friendship = await friendshipRepository.findById(friendshipId);

  if (!friendship) {
    throw new AppError('Solicitud no encontrada.', 'FRIENDSHIP_NOT_FOUND', 404);
  }
  if (friendship.receiverId !== userId) {
    throw new AppError('No tienes permiso para rechazar esta solicitud.', 'FORBIDDEN', 403);
  }
  if (friendship.status !== 'PENDING') {
    throw new AppError('La solicitud no está pendiente.', 'INVALID_STATUS', 409);
  }

  await friendshipRepository.delete(friendshipId);
}

/**
 * Elimina una amistad aceptada, o cancela una solicitud pendiente (solo el sender puede cancelar).
 * @throws {AppError} FRIENDSHIP_NOT_FOUND (404) si no existe.
 * @throws {AppError} FORBIDDEN (403) si el userId no pertenece a la relación.
 * @throws {AppError} NOT_FRIENDS (409) si el estado no es PENDING ni ACCEPTED.
 */
export async function unfriend(friendshipId: string, userId: string): Promise<void> {
  const friendship = await friendshipRepository.findById(friendshipId);

  if (!friendship) {
    throw new AppError('Relación de amistad no encontrada.', 'FRIENDSHIP_NOT_FOUND', 404);
  }
  if (friendship.senderId !== userId && friendship.receiverId !== userId) {
    throw new AppError('No tienes permiso para eliminar esta amistad.', 'FORBIDDEN', 403);
  }

  if (friendship.status === 'PENDING') {
    // Solo el emisor puede cancelar una solicitud pendiente
    if (friendship.senderId !== userId) {
      throw new AppError('No tienes permiso para cancelar esta solicitud.', 'FORBIDDEN', 403);
    }
  } else if (friendship.status !== 'ACCEPTED') {
    throw new AppError('No sois amigos.', 'NOT_FRIENDS', 409);
  }

  await friendshipRepository.delete(friendshipId);
}

export async function getFriendshipStatus(
  currentUserId: string,
  targetUsername: string,
): Promise<FriendshipStatusResult> {
  const targetUser = await findUserByUsername(targetUsername);
  if (!targetUser || targetUser.deletedAt) {
    throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);
  }
  if (currentUserId === targetUser.id) {
    throw new AppError('No puedes consultar tu propio estado de amistad.', 'CANNOT_CHECK_SELF', 400);
  }

  const friendship = await friendshipRepository.findBetween(currentUserId, targetUser.id);
  if (!friendship) {
    return { status: 'none' };
  }
  if (friendship.status === 'BLOCKED') {
    return { status: 'blocked' };
  }
  if (friendship.status === 'ACCEPTED') {
    return { status: 'accepted', friendshipId: friendship.id };
  }
  // PENDING — determinar dirección
  if (friendship.senderId === currentUserId) {
    return { status: 'pending_sent', friendshipId: friendship.id };
  }
  return { status: 'pending_received', friendshipId: friendship.id };
}

/** Devuelve la lista paginada de amigos (status ACCEPTED) del usuario. */
export async function getFriends(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<Friendship>> {
  const [rows, total] = await friendshipRepository.findAcceptedFriends(userId, page, limit);
  return { data: rows.map(toFriendshipDto), total, page, limit };
}

/** Devuelve la lista paginada de solicitudes de amistad recibidas (PENDING) por el usuario. */
export async function getPendingRequests(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<Friendship>> {
  const [rows, total] = await friendshipRepository.findPendingReceived(userId, page, limit);
  return { data: rows.map(toFriendshipDto), total, page, limit };
}
