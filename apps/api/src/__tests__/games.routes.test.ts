// Tests de integración HTTP para GET /api/v1/games/:id/achievements
// y POST /api/v1/games/:id/fetch-achievements

jest.mock('../services/search.service');
jest.mock('../services/games.service');
jest.mock('../lib/redis', () => ({ redis: { on: jest.fn() } }));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';

import * as searchService from '../services/search.service';
import * as gamesService from '../services/games.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

const mockGamesService = gamesService as jest.Mocked<typeof gamesService>;

const mockSearchService = searchService as jest.Mocked<typeof searchService>;

const makeAchievement = (overrides = {}) => ({
  id: 'ach1',
  title: 'First Steps',
  description: null,
  iconUrl: null,
  rarity: 5.2,
  normalizedPoints: 10,
  platform: 'STEAM',
  externalId: 'ach_001',
  externalUrl: null,
  isUnlocked: false,
  unlockedAt: null,
  ...overrides,
});

const makeGameAchievementsResponse = (overrides = {}) => ({
  achievements: [makeAchievement()],
  earnedCount: 0,
  totalCount: 1,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
});

describe('GET /api/v1/games/:id/achievements — sin JWT', () => {
  it('200 con todos los logros y isUnlocked: false', async () => {
    mockSearchService.getGameAchievementsWithStatus.mockResolvedValue(
      makeGameAchievementsResponse(),
    );

    const res = await request(app).get('/api/v1/games/g1/achievements');

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.earnedCount).toBe(0);
    expect(res.body.achievements[0].isUnlocked).toBe(false);
  });

  it('llama al service sin userId cuando no hay token', async () => {
    mockSearchService.getGameAchievementsWithStatus.mockResolvedValue(
      makeGameAchievementsResponse(),
    );

    await request(app).get('/api/v1/games/g1/achievements');

    expect(mockSearchService.getGameAchievementsWithStatus).toHaveBeenCalledWith(
      'g1',
      undefined,
    );
  });

  it('404 si el juego no existe', async () => {
    mockSearchService.getGameAchievementsWithStatus.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/games/no-existe/achievements');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GAME_NOT_FOUND');
  });
});

describe('POST /api/v1/games/:id/fetch-achievements', () => {
  const validToken = () =>
    signAccessToken({ sub: 'user-1', email: 'test@example.com', isPremium: false });

  it('401 sin token', async () => {
    const res = await request(app).post('/api/v1/games/g1/fetch-achievements');
    expect(res.status).toBe(401);
  });

  it('200 con { achievementsAdded } cuando el service resuelve correctamente', async () => {
    mockGamesService.fetchAndUpsertGameAchievements.mockResolvedValue({ achievementsAdded: 42 });

    const res = await request(app)
      .post('/api/v1/games/g1/fetch-achievements')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.achievementsAdded).toBe(42);
    expect(mockGamesService.fetchAndUpsertGameAchievements).toHaveBeenCalledWith('g1');
  });

  it('200 con achievementsAdded: 0 cuando el juego ya tiene logros (guard)', async () => {
    mockGamesService.fetchAndUpsertGameAchievements.mockResolvedValue({ achievementsAdded: 0 });

    const res = await request(app)
      .post('/api/v1/games/g1/fetch-achievements')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.achievementsAdded).toBe(0);
  });

  it('404 si el service lanza GAME_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual<typeof import('../middleware/errorHandler')>('../middleware/errorHandler');
    mockGamesService.fetchAndUpsertGameAchievements.mockRejectedValue(
      new AppError('Juego no encontrado', 'GAME_NOT_FOUND', 404),
    );

    const res = await request(app)
      .post('/api/v1/games/no-existe/fetch-achievements')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GAME_NOT_FOUND');
  });

  it('400 si el service lanza PLATFORM_NOT_SUPPORTED (Xbox)', async () => {
    const { AppError } = jest.requireActual<typeof import('../middleware/errorHandler')>('../middleware/errorHandler');
    mockGamesService.fetchAndUpsertGameAchievements.mockRejectedValue(
      new AppError('Xbox no soportado', 'PLATFORM_NOT_SUPPORTED', 400),
    );

    const res = await request(app)
      .post('/api/v1/games/xbox-game/fetch-achievements')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PLATFORM_NOT_SUPPORTED');
  });
});

describe('GET /api/v1/games/:id/achievements — con JWT válido', () => {
  it('200 y pasa userId al service', async () => {
    mockSearchService.getGameAchievementsWithStatus.mockResolvedValue(
      makeGameAchievementsResponse({ earnedCount: 1, achievements: [makeAchievement({ isUnlocked: true, unlockedAt: '2024-01-15T00:00:00.000Z' })] }),
    );

    const token = signAccessToken({ sub: 'user-1', email: 'test@example.com', isPremium: false });
    const res = await request(app)
      .get('/api/v1/games/g1/achievements')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockSearchService.getGameAchievementsWithStatus).toHaveBeenCalledWith('g1', 'user-1');
    expect(res.body.earnedCount).toBe(1);
    expect(res.body.achievements[0].isUnlocked).toBe(true);
  });

  it('200 (no 401) si el JWT es inválido — comporta como sin token', async () => {
    mockSearchService.getGameAchievementsWithStatus.mockResolvedValue(
      makeGameAchievementsResponse(),
    );

    const res = await request(app)
      .get('/api/v1/games/g1/achievements')
      .set('Authorization', 'Bearer token-invalido');

    expect(res.status).toBe(200);
    expect(mockSearchService.getGameAchievementsWithStatus).toHaveBeenCalledWith(
      'g1',
      undefined,
    );
  });
});
