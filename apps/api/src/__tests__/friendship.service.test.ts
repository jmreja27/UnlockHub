import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  getFriends,
  getPendingRequests,
  getFriendshipStatus,
} from '../services/friendship.service';
import { friendshipRepository } from '../repositories/friendship.repository';
import { findUserByUsername } from '../repositories/user.repository';

jest.mock('../repositories/friendship.repository');
jest.mock('../repositories/user.repository');

const mockRepo = friendshipRepository as jest.Mocked<typeof friendshipRepository>;
const mockFindUser = findUserByUsername as jest.MockedFunction<typeof findUserByUsername>;

const makeFriendship = (overrides = {}) => ({
  id: 'f1',
  senderId: 'userA',
  receiverId: 'userB',
  status: 'PENDING' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeUser = (overrides: Partial<{ id: string; username: string; deletedAt: Date | null }> = {}) => ({
  id: 'targetId',
  username: 'targetUser',
  email: 'target@test.com',
  passwordHash: 'hash',
  avatar: null,
  banner: null,
  bio: null,
  level: 1,
  xp: 0,
  streakDays: 0,
  streakShields: 0,
  countryCode: null,
  role: 'USER' as const,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  deletedAt: null,
  birthDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('sendFriendRequest', () => {
  it('lanza error si sender === receiver', async () => {
    await expect(sendFriendRequest('u1', 'u1')).rejects.toMatchObject({ code: 'SELF_FRIEND_REQUEST' });
  });

  it('lanza error si ya son amigos', async () => {
    mockRepo.findBetween.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    await expect(sendFriendRequest('userA', 'userB')).rejects.toMatchObject({ code: 'ALREADY_FRIENDS' });
  });

  it('lanza error si ya hay solicitud pendiente', async () => {
    mockRepo.findBetween.mockResolvedValue(makeFriendship());
    await expect(sendFriendRequest('userA', 'userB')).rejects.toMatchObject({ code: 'REQUEST_ALREADY_SENT' });
  });

  it('crea la solicitud si no existe relación previa', async () => {
    mockRepo.findBetween.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue(makeFriendship());
    const result = await sendFriendRequest('userA', 'userB');
    expect(result.status).toBe('PENDING');
    expect(mockRepo.create).toHaveBeenCalledWith('userA', 'userB');
  });
});

describe('acceptFriendRequest', () => {
  it('lanza error si la solicitud no existe', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(acceptFriendRequest('f1', 'userB')).rejects.toMatchObject({ code: 'FRIENDSHIP_NOT_FOUND' });
  });

  it('lanza error si el usuario no es el destinatario', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship());
    await expect(acceptFriendRequest('f1', 'userA')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lanza error si el estado no es PENDING', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    await expect(acceptFriendRequest('f1', 'userB')).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });

  it('acepta la solicitud correctamente', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship());
    mockRepo.updateStatus.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    const result = await acceptFriendRequest('f1', 'userB');
    expect(result.status).toBe('ACCEPTED');
  });
});

describe('rejectFriendRequest', () => {
  it('elimina la solicitud si el receptor rechaza', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship());
    mockRepo.delete.mockResolvedValue(makeFriendship());
    await expect(rejectFriendRequest('f1', 'userB')).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith('f1');
  });

  it('lanza error si el usuario no es el receptor', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship());
    await expect(rejectFriendRequest('f1', 'userA')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('unfriend', () => {
  it('elimina la amistad si el usuario participa', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    mockRepo.delete.mockResolvedValue(makeFriendship());
    await expect(unfriend('f1', 'userA')).resolves.toBeUndefined();
  });

  it('lanza error si el usuario no participa en la amistad', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    await expect(unfriend('f1', 'userC')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cancela la solicitud PENDING si el emisor la solicita', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'PENDING' }));
    mockRepo.delete.mockResolvedValue(makeFriendship());
    await expect(unfriend('f1', 'userA')).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith('f1');
  });

  it('lanza FORBIDDEN si el receptor intenta cancelar una solicitud pendiente', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'PENDING' }));
    await expect(unfriend('f1', 'userB')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('getFriends', () => {
  it('devuelve lista paginada de amigos', async () => {
    const row = { ...makeFriendship({ status: 'ACCEPTED' }), sender: { id: 'userA', username: 'a', avatar: null, level: 1, xp: 0 }, receiver: { id: 'userB', username: 'b', avatar: null, level: 1, xp: 0 } };
    mockRepo.findAcceptedFriends.mockResolvedValue([[row], 1]);
    const result = await getFriends('userA', 1, 20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});

describe('getPendingRequests', () => {
  it('devuelve solicitudes pendientes recibidas', async () => {
    const row = { ...makeFriendship(), sender: { id: 'userA', username: 'a', avatar: null, level: 1, xp: 0 } };
    mockRepo.findPendingReceived.mockResolvedValue([[row], 1]);
    const result = await getPendingRequests('userB', 1, 20);
    expect(result.total).toBe(1);
    expect(result.data[0]?.status).toBe('PENDING');
  });
});

describe('getFriendshipStatus', () => {
  it('lanza USER_NOT_FOUND si el username no existe', async () => {
    mockFindUser.mockResolvedValue(null);
    await expect(getFriendshipStatus('currentId', 'ghost')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('lanza USER_NOT_FOUND si el usuario tiene soft delete', async () => {
    mockFindUser.mockResolvedValue(makeUser({ deletedAt: new Date() }));
    await expect(getFriendshipStatus('currentId', 'deleted')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('lanza CANNOT_CHECK_SELF si se consulta el propio username', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'currentId' }));
    await expect(getFriendshipStatus('currentId', 'me')).rejects.toMatchObject({ code: 'CANNOT_CHECK_SELF' });
  });

  it('devuelve none cuando no hay relación', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'targetId' }));
    mockRepo.findBetween.mockResolvedValue(null);
    const result = await getFriendshipStatus('currentId', 'targetUser');
    expect(result).toEqual({ status: 'none' });
  });

  it('devuelve pending_sent cuando el current envió la solicitud', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'targetId' }));
    mockRepo.findBetween.mockResolvedValue(makeFriendship({ senderId: 'currentId', receiverId: 'targetId', status: 'PENDING' }));
    const result = await getFriendshipStatus('currentId', 'targetUser');
    expect(result).toEqual({ status: 'pending_sent', friendshipId: 'f1' });
  });

  it('devuelve pending_received cuando el target envió la solicitud', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'targetId' }));
    mockRepo.findBetween.mockResolvedValue(makeFriendship({ senderId: 'targetId', receiverId: 'currentId', status: 'PENDING' }));
    const result = await getFriendshipStatus('currentId', 'targetUser');
    expect(result).toEqual({ status: 'pending_received', friendshipId: 'f1' });
  });

  it('devuelve accepted cuando son amigos', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'targetId' }));
    mockRepo.findBetween.mockResolvedValue(makeFriendship({ status: 'ACCEPTED' }));
    const result = await getFriendshipStatus('currentId', 'targetUser');
    expect(result).toEqual({ status: 'accepted', friendshipId: 'f1' });
  });

  it('devuelve blocked cuando hay bloqueo', async () => {
    mockFindUser.mockResolvedValue(makeUser({ id: 'targetId' }));
    mockRepo.findBetween.mockResolvedValue(makeFriendship({ status: 'BLOCKED' }));
    const result = await getFriendshipStatus('currentId', 'targetUser');
    expect(result).toEqual({ status: 'blocked' });
  });
});
