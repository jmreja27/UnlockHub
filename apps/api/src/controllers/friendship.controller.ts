import type { Request, Response, NextFunction } from 'express';
import { sendFriendRequestSchema, friendshipActionSchema, paginationSchema } from '@unlockhub/validators';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import * as friendshipService from '../services/friendship.service';

export async function sendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { receiverId } = sendFriendRequestSchema.parse(req.body);
    const friendship = await friendshipService.sendFriendRequest((req as AuthenticatedRequest).user.id, receiverId);
    res.status(201).json(friendship);
  } catch (err) {
    next(err);
  }
}

export async function acceptRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { friendshipId } = friendshipActionSchema.parse(req.params);
    const friendship = await friendshipService.acceptFriendRequest(friendshipId, (req as AuthenticatedRequest).user.id);
    res.json(friendship);
  } catch (err) {
    next(err);
  }
}

export async function rejectRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { friendshipId } = friendshipActionSchema.parse(req.params);
    await friendshipService.rejectFriendRequest(friendshipId, (req as AuthenticatedRequest).user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeFriend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { friendshipId } = friendshipActionSchema.parse(req.params);
    await friendshipService.unfriend(friendshipId, (req as AuthenticatedRequest).user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listFriends(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await friendshipService.getFriends((req as AuthenticatedRequest).user.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listPendingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await friendshipService.getPendingRequests((req as AuthenticatedRequest).user.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
