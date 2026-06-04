import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import * as friendshipController from '../controllers/friendship.controller';

const router = Router();

router.use(authenticate);

router.post('/', friendshipController.sendRequest);
router.get('/', friendshipController.listFriends);
router.get('/pending', friendshipController.listPendingRequests);
// Declarada ANTES de /:friendshipId para que Express no interprete "status" como un ID
router.get('/status/:username', friendshipController.getFriendshipStatus);
router.post('/:friendshipId/accept', friendshipController.acceptRequest);
router.delete('/:friendshipId/reject', friendshipController.rejectRequest);
router.delete('/:friendshipId', friendshipController.removeFriend);

export default router;
