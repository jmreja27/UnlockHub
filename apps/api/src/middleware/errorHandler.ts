import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import type { ApiError } from '@unlockhub/types';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const response: ApiError = {
      error: 'Datos de entrada inválidos',
      code: 'VALIDATION_ERROR',
      details: err.flatten(),
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: ApiError = {
      error: err.message,
      code: err.code,
      details: err.details,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  console.error('Error no controlado:', err);
  const response: ApiError = {
    error: 'Error interno del servidor',
    code: 'INTERNAL_SERVER_ERROR',
  };
  res.status(500).json(response);
}
