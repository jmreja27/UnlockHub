import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, unfriend, getFriends, getPendingRequests } from '../services/friendship.service';
import { friendshipRepository } from '../repositories/friendship.repository';

jest.mock('../repositories/friendship.repository');

const mockRepo = friendshipRepository as jest.Mocked<typeof friendshipRepository>;

const makeFriendship = (overrides = {}) => ({
  id: 'f1',
  senderId: 'userA',
  receiverId: 'userB',
  status: 'PENDING' as const,
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

  it('lanza error si no son amigos', async () => {
    mockRepo.findById.mockResolvedValue(makeFriendship({ status: 'PENDING' }));
    await expect(unfriend('f1', 'userA')).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
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
