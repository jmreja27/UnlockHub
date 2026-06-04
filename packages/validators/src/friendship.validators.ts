import { z } from 'zod';

export const sendFriendRequestSchema = z.union([
  z.object({ receiverId: z.string().cuid() }),
  z.object({ username: z.string().min(3).max(30) }),
]);

export const friendshipActionSchema = z.object({
  friendshipId: z.string().cuid(),
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type FriendshipActionInput = z.infer<typeof friendshipActionSchema>;
