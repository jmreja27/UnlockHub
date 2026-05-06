import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  receiverId: z.string().cuid(),
});

export const friendshipActionSchema = z.object({
  friendshipId: z.string().cuid(),
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type FriendshipActionInput = z.infer<typeof friendshipActionSchema>;
