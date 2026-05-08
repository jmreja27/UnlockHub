jest.mock('../services/activity.service', () => ({
  getFriendsFeed: jest.fn(),
  getPublicFeed: jest.fn(),
}));
jest.mock('../services/points.service', () => ({
  getPointsHistory: jest.fn(),
  getPointsTotal: jest.fn(),
}));
jest.mock('../services/challenge.service', () => ({
  getActiveChallenge: jest.fn(),
  getUserChallengeStatus: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({
  saveDeviceToken: jest.fn(),
  removeDeviceToken: jest.fn(),
}));

import type { Request, Response, NextFunction } from 'express';
import { getFriendsFeedHandler, getPublicFeedHandler } from '../controllers/activity.controller';
import { getHistoryHandler, getTotalHandler } from '../controllers/points.controller';
import { getActiveChallengeHandler, getMyChallengeStatusHandler } from '../controllers/challenge.controller';
import { registerDeviceTokenHandler, removeDeviceTokenHandler } from '../controllers/notification.controller';
import { getFriendsFeed, getPublicFeed } from '../services/activity.service';
import { getPointsHistory, getPointsTotal } from '../services/points.service';
import { getActiveChallenge, getUserChallengeStatus } from '../services/challenge.service';
import { saveDeviceToken, removeDeviceToken } from '../services/notification.service';

const mockGetFriendsFeed = getFriendsFeed as jest.Mock;
const mockGetPublicFeed = getPublicFeed as jest.Mock;
const mockGetPointsHistory = getPointsHistory as jest.Mock;
const mockGetPointsTotal = getPointsTotal as jest.Mock;
const mockGetActiveChallenge = getActiveChallenge as jest.Mock;
const mockGetUserChallengeStatus = getUserChallengeStatus as jest.Mock;
const mockSaveDeviceToken = saveDeviceToken as jest.Mock;
const mockRemoveDeviceToken = removeDeviceToken as jest.Mock;

function makeRes() {
  const res = { json: jest.fn(), status: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

function makeNext(): NextFunction {
  return jest.fn();
}

function makeReq(overrides: Partial<Request & { user: { id: string } }> = {}): Request {
  return {
    query: {},
    body: {},
    params: {},
    user: { id: 'u1' },
    ...overrides,
  } as unknown as Request;
}

const PAGINATED = { data: [], total: 0, page: 1, limit: 20 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFriendsFeed.mockResolvedValue(PAGINATED);
  mockGetPublicFeed.mockResolvedValue(PAGINATED);
  mockGetPointsHistory.mockResolvedValue(PAGINATED);
  mockGetPointsTotal.mockResolvedValue(100);
  mockGetActiveChallenge.mockResolvedValue(null);
  mockGetUserChallengeStatus.mockResolvedValue(null);
  mockSaveDeviceToken.mockResolvedValue(undefined);
  mockRemoveDeviceToken.mockResolvedValue(undefined);
});

describe('activity controller', () => {
  it('getFriendsFeedHandler devuelve el feed paginado', async () => {
    const req = makeReq({ query: { page: '1', limit: '20' } });
    const res = makeRes();
    await getFriendsFeedHandler(req, res, makeNext());
    expect(mockGetFriendsFeed).toHaveBeenCalledWith('u1', 1, 20);
    expect(res.json).toHaveBeenCalledWith(PAGINATED);
  });

  it('getFriendsFeedHandler llama a next si el servicio lanza', async () => {
    mockGetFriendsFeed.mockRejectedValue(new Error('boom'));
    const next = makeNext();
    await getFriendsFeedHandler(makeReq({ query: {} }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('getPublicFeedHandler devuelve el feed público', async () => {
    const req = makeReq({ query: { page: '1', limit: '20' } });
    const res = makeRes();
    await getPublicFeedHandler(req, res, makeNext());
    expect(mockGetPublicFeed).toHaveBeenCalledWith(1, 20);
    expect(res.json).toHaveBeenCalledWith(PAGINATED);
  });

  it('getPublicFeedHandler llama a next si el servicio lanza', async () => {
    mockGetPublicFeed.mockRejectedValue(new Error('boom'));
    const next = makeNext();
    await getPublicFeedHandler(makeReq({ query: {} }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('points controller', () => {
  it('getHistoryHandler devuelve el historial paginado', async () => {
    const res = makeRes();
    await getHistoryHandler(makeReq({ query: { page: '1', limit: '20' } }), res, makeNext());
    expect(mockGetPointsHistory).toHaveBeenCalledWith('u1', 1, 20);
    expect(res.json).toHaveBeenCalledWith(PAGINATED);
  });

  it('getTotalHandler devuelve el total de puntos', async () => {
    const res = makeRes();
    await getTotalHandler(makeReq(), res, makeNext());
    expect(mockGetPointsTotal).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({ total: 100 });
  });

  it('getHistoryHandler llama a next si el servicio lanza', async () => {
    mockGetPointsHistory.mockRejectedValue(new Error('boom'));
    const next = makeNext();
    await getHistoryHandler(makeReq({ query: {} }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('challenge controller', () => {
  it('getActiveChallengeHandler devuelve el reto activo', async () => {
    mockGetActiveChallenge.mockResolvedValue({ id: 'c1', title: 'Reto' });
    const res = makeRes();
    await getActiveChallengeHandler(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ challenge: { id: 'c1', title: 'Reto' } });
  });

  it('getMyChallengeStatusHandler devuelve el estado del usuario', async () => {
    mockGetUserChallengeStatus.mockResolvedValue({ progress: 3, completedAt: null });
    const res = makeRes();
    await getMyChallengeStatusHandler(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ status: { progress: 3, completedAt: null } });
  });

  it('getActiveChallengeHandler llama a next si el servicio lanza', async () => {
    mockGetActiveChallenge.mockRejectedValue(new Error('boom'));
    const next = makeNext();
    await getActiveChallengeHandler(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('notification controller', () => {
  it('registerDeviceTokenHandler registra el token', async () => {
    const res = makeRes();
    const req = makeReq({ body: { token: 'ExponentPushToken[xxx]', platform: 'android' } });
    await registerDeviceTokenHandler(req, res, makeNext());
    expect(mockSaveDeviceToken).toHaveBeenCalledWith('u1', 'ExponentPushToken[xxx]', 'android');
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('registerDeviceTokenHandler lanza si el body es inválido', async () => {
    const next = makeNext();
    await registerDeviceTokenHandler(makeReq({ body: {} }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('removeDeviceTokenHandler elimina el token', async () => {
    const res = makeRes();
    await removeDeviceTokenHandler(makeReq({ body: { token: 'tok' } }), res, makeNext());
    expect(mockRemoveDeviceToken).toHaveBeenCalledWith('u1', 'tok');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
