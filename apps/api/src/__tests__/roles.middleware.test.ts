import type { Request, Response, NextFunction } from 'express';
import { requirePremium } from '../middleware/roles.middleware';
import { AppError } from '../middleware/errorHandler';

function makeReq(user?: { id: string; email: string; isPremium: boolean }): Request {
  return { user } as unknown as Request;
}

const res = {} as Response;

describe('requirePremium', () => {
  it('llama a next() cuando el usuario tiene isPremium=true', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ id: 'u1', email: 'a@b.com', isPremium: true });

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // sin argumentos → sin error
  });

  it('llama a next(AppError) cuando el usuario tiene isPremium=false', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ id: 'u1', email: 'a@b.com', isPremium: false });

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('PREMIUM_REQUIRED');
    expect(error.statusCode).toBe(403);
  });

  it('llama a next(AppError) cuando no hay usuario en la request', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq(undefined);

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('PREMIUM_REQUIRED');
    expect(error.statusCode).toBe(403);
  });

  it('el mensaje de error es descriptivo', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ id: 'u1', email: 'a@b.com', isPremium: false });

    requirePremium(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/premium/i);
  });

  it('no llama a next dos veces cuando el usuario es free', () => {
    const next = jest.fn() as NextFunction;
    const req = makeReq({ id: 'u1', email: 'a@b.com', isPremium: false });

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
