import type { RequestHandler } from 'express';
import multer from 'multer';

import { AppError } from './errorHandler';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Magic bytes de los formatos permitidos:
// JPEG: FF D8 FF
// PNG:  89 50 4E 47 0D 0A 1A 0A
// WebP: RIFF????WEBP (bytes 0-3 = 52 49 46 46, bytes 8-11 = 57 45 42 50)
function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';

  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf.length >= 8 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';

  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';

  return null;
}

export function createUploadMiddleware(field: string): RequestHandler {
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

// Valida magic bytes del buffer real tras multer para evitar spoofing de Content-Type.
// Debe ejecutarse DESPUÉS del middleware de multer.
export const validateFileMagicBytes: RequestHandler = (req, _res, next) => {
  if (!req.file) {
    next();
    return;
  }

  const detected = detectMimeFromBuffer(req.file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected)) {
    next(new AppError('El contenido del archivo no coincide con el tipo permitido.', 'INVALID_FILE_CONTENT', 400));
    return;
  }

  next();
};

export const uploadAvatar: RequestHandler[] = [createUploadMiddleware('avatar'), validateFileMagicBytes];
export const uploadBanner: RequestHandler[] = [createUploadMiddleware('banner'), validateFileMagicBytes];
