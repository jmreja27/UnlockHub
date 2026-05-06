import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  getMeHandler,
  updateMeHandler,
  getPublicProfileHandler,
} from '../controllers/user.controller';

const router = Router();

// Rutas privadas — requieren autenticación
router.get('/me', authenticate, getMeHandler);
router.patch('/me', authenticate, updateMeHandler);

// Ruta pública — perfil de cualquier usuario por username
router.get('/:username', getPublicProfileHandler);

export default router;
