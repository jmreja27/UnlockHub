import { friendshipRepository } from '../repositories/friendship.repository';
import { AppError } from '../middleware/errorHandler';
import type { Friendship, PaginatedResponse } from '@unlockhub/types';

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
  return toFriendshipDto(updated);
}

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

export async function unfriend(friendshipId: string, userId: string): Promise<void> {
  const friendship = await friendshipRepository.findById(friendshipId);

  if (!friendship) {
    throw new AppError('Relación de amistad no encontrada.', 'FRIENDSHIP_NOT_FOUND', 404);
  }
  if (friendship.senderId !== userId && friendship.receiverId !== userId) {
    throw new AppError('No tienes permiso para eliminar esta amistad.', 'FORBIDDEN', 403);
  }
  if (friendship.status !== 'ACCEPTED') {
    throw new AppError('No sois amigos.', 'NOT_FRIENDS', 409);
  }

  await friendshipRepository.delete(friendshipId);
}

export async function getFriends(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<Friendship>> {
  const [rows, total] = await friendshipRepository.findAcceptedFriends(userId, page, limit);
  return { data: rows.map(toFriendshipDto), total, page, limit };
}

export async function getPendingRequests(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<Friendship>> {
  const [rows, total] = await friendshipRepository.findPendingReceived(userId, page, limit);
  return { data: rows.map(toFriendshipDto), total, page, limit };
}
