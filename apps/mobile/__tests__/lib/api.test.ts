import { apiRequest } from '../../lib/api';

jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({ accessToken: 'test-token', setAccessToken: jest.fn() }),
  },
}));

describe('apiRequest — Content-Type header', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
      headers: { get: () => null },
    });
    global.fetch = fetchMock;
  });

  it('omite Content-Type cuando body es FormData', async () => {
    const formData = new FormData();
    formData.append('avatar', 'blob-data');

    await apiRequest('/api/v1/users/me/avatar', { method: 'PATCH', body: formData });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('incluye Content-Type: application/json cuando body no es FormData', async () => {
    await apiRequest('/api/v1/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('incluye Content-Type: application/json cuando no hay body', async () => {
    await apiRequest('/api/v1/test', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
