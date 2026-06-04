import * as guideService from '../services/guide.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    achievementGuide: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    achievement: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockFindMany = prisma.achievementGuide.findMany as jest.Mock;
const mockGuideCount = prisma.achievementGuide.count as jest.Mock;
const mockGuideFind = prisma.achievementGuide.findUnique as jest.Mock;
const mockGuideCreate = prisma.achievementGuide.create as jest.Mock;
const mockGuideUpdate = prisma.achievementGuide.update as jest.Mock;
const mockAchievementFind = prisma.achievement.findUnique as jest.Mock;

const now = new Date('2024-06-01T10:00:00.000Z');

const guideRow = {
  id: 'g-1',
  content: 'Esta es una guía de prueba',
  upvotes: 5,
  reported: false,
  createdAt: now,
  user: { id: 'u-1', username: 'guider', avatar: null },
};

beforeEach(() => jest.clearAllMocks());

describe('getGuides', () => {
  it('devuelve guías paginadas con total', async () => {
    mockFindMany.mockResolvedValue([guideRow]);
    mockGuideCount.mockResolvedValue(3);

    const result = await guideService.getGuides('ach-1', 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.createdAt).toBe(now.toISOString());
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('aplica skip correcto para páginas > 1', async () => {
    mockFindMany.mockResolvedValue([]);
    mockGuideCount.mockResolvedValue(0);

    await guideService.getGuides('ach-1', 3, 5);

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 5 }));
  });
});

describe('createGuide', () => {
  it('crea una guía cuando el logro existe', async () => {
    mockAchievementFind.mockResolvedValue({ id: 'ach-1' });
    mockGuideCreate.mockResolvedValue(guideRow);

    const result = await guideService.createGuide('u-1', 'ach-1', 'Esta es una guía de prueba');

    expect(result.id).toBe('g-1');
    expect(result.upvotes).toBe(5);
  });

  it('lanza ACHIEVEMENT_NOT_FOUND si el logro no existe', async () => {
    mockAchievementFind.mockResolvedValue(null);

    await expect(guideService.createGuide('u-1', 'no-existe', 'contenido')).rejects.toMatchObject({
      code: 'ACHIEVEMENT_NOT_FOUND',
      statusCode: 404,
    });
    expect(mockGuideCreate).not.toHaveBeenCalled();
  });
});

describe('upvoteGuide', () => {
  it('incrementa upvotes cuando la guía existe', async () => {
    mockGuideFind.mockResolvedValue({ id: 'g-1' });
    mockGuideUpdate.mockResolvedValue({ ...guideRow, upvotes: 6 });

    const result = await guideService.upvoteGuide('u-1', 'g-1');

    expect(result.upvotes).toBe(6);
    expect(mockGuideUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { upvotes: { increment: 1 } } }),
    );
  });

  it('lanza GUIDE_NOT_FOUND si la guía no existe', async () => {
    mockGuideFind.mockResolvedValue(null);

    await expect(guideService.upvoteGuide('u-1', 'no-existe')).rejects.toMatchObject({
      code: 'GUIDE_NOT_FOUND',
      statusCode: 404,
    });
  });
});

describe('reportGuide', () => {
  it('marca la guía como reportada', async () => {
    mockGuideFind.mockResolvedValue({ id: 'g-1' });
    mockGuideUpdate.mockResolvedValue({});

    const result = await guideService.reportGuide('u-1', 'g-1');

    expect(result).toEqual({ ok: true });
    expect(mockGuideUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reported: true } }),
    );
  });

  it('lanza GUIDE_NOT_FOUND si la guía no existe', async () => {
    mockGuideFind.mockResolvedValue(null);

    await expect(guideService.reportGuide('u-1', 'no-existe')).rejects.toMatchObject({
      code: 'GUIDE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
