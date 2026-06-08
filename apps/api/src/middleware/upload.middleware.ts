import multer from 'multer';

import { AppError } from './errorHandler';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function createUploadMiddleware(field: string) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new AppError('Formato no permitido. Usa JPG, PNG o WebP.', 'INVALID_FILE_TYPE', 400));
      }
    },
  }).single(field);
}

export const uploadAvatar = createUploadMiddleware('avatar');
export const uploadBanner = createUploadMiddleware('banner');
