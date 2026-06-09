import axios from 'axios';

import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { upsert: jest.fn() },
    achievement: { upsert: jest.fn() },
    userAchievement: { upsert: jest.fn() },
    platformAccount: { upsert: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockLogger = logger as jest.Mocked<typeof logger>;

const baseAccount = {
  id: 'acc-1',
  userId: 'user-1',
  platform: 'RA' as const,
  externalId: 'rauser',
  username: 'rauser',
  encryptedToken: '',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  psnProfilePrivate: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Respuesta de progreso válida (usado por processRaGame)
const validGameProgress = {
  ID: '1',
  Title: 'Super Mario Bros',
  ImageIcon: '/images/game.png',
  NumAchievements: 10,
  ConsoleName: 'NES',
  Achievements: {
    'ach-1': {
      ID: 1,
      Title: 'First Step',
      Description: 'Complete World 1-1',
      BadgeName: 'badge1',
      Points: 10,
      DateEarned: '2024-01-15 10:00:00',
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  // Por defecto las queries de prisma se resuelven correctamente
  (mockPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-1' });
  (mockPrisma.achievement.upsert as jest.Mock).mockResolvedValue({ id: 'ach-db-1' });
  (mockPrisma.userAchievement.upsert as jest.Mock).mockResolvedValue({});
  (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue({});
});

describe('retroAchievementsAdapter.syncUserExpress', () => {
  // Nota: processRaGame captura su propio error de red (devuelve {gamesUpdated:0, achievementsSynced:0}).
  // Para que Promise.allSettled vea un rechazo real, el error debe ocurrir FUERA del try-catch
  // interno de processRaGame — por ejemplo, en prisma.game.upsert.

  it('BUG-MEDIO-3: no aborta el sync completo si prisma.game.upsert falla en un juego', async () => {
    mockAxios.get.mockImplementation((url: string) => {
      if ((url as string).includes('GetUserCompletedGames')) {
        return Promise.resolve({
          data: [
            { GameID: '1', Title: 'Game 1', NumAwarded: 10 },
            { GameID: '2', Title: 'Game 2', NumAwarded: 8 },
          ],
        });
      }
      return Promise.resolve({ data: validGameProgress });
    });

    // Primer juego falla en DB upsert, segundo tiene éxito
    (mockPrisma.game.upsert as jest.Mock)
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValue({ id: 'game-2' });

    // No debe lanzar — Promise.allSettled aísla el fallo
    await expect(retroAchievementsAdapter.syncUserExpress(baseAccount)).resolves.toMatchObject({
      platform: 'RA',
    });
  });

  it('BUG-MEDIO-3: loguea warn cuando prisma.game.upsert lanza para un juego', async () => {
    mockAxios.get.mockImplementation((url: string) => {
      if ((url as string).includes('GetUserCompletedGames')) {
        return Promise.resolve({
          data: [
            { GameID: '1', Title: 'Game 1', NumAwarded: 10 },
            { GameID: '2', Title: 'Game 2', NumAwarded: 8 },
          ],
        });
      }
      return Promise.resolve({ data: validGameProgress });
    });

    // Hace que TODOS los upserts fallen para garantizar que logger.warn sea llamado
    (mockPrisma.game.upsert as jest.Mock).mockRejectedValue(new Error('DB error'));

    await retroAchievementsAdapter.syncUserExpress(baseAccount);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('[RA] syncUserExpress'),
    );
  });

  it('procesa correctamente cuando todos los juegos tienen exito', async () => {
    mockAxios.get.mockImplementation((url: string) => {
      if ((url as string).includes('GetUserCompletedGames')) {
        return Promise.resolve({
          data: [{ GameID: '1', Title: 'Game 1', NumAwarded: 5 }],
        });
      }
      return Promise.resolve({ data: validGameProgress });
    });

    const result = await retroAchievementsAdapter.syncUserExpress(baseAccount);

    expect(result.platform).toBe('RA');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
