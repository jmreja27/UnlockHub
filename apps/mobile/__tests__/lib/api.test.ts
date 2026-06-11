import { apiRequest, uploadFile, ApiRequestError } from '../../lib/api';

jest.mock('../../stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({ accessToken: 'test-token', setAccessToken: jest.fn() }),
  },
}));

describe('uploadFile — XMLHttpRequest multipart', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let xhrInstance: any;

  beforeEach(() => {
    xhrInstance = {
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: jest.fn(),
      onload: null,
      onerror: null,
      status: 200,
      responseText: JSON.stringify({ avatar: 'https://cdn.example.com/avatar.jpg' }),
      getResponseHeader: jest.fn().mockReturnValue(null),
    };
    (global as unknown as Record<string, unknown>).XMLHttpRequest = jest.fn(
      () => xhrInstance,
    );
  });

  function triggerLoad() {
    xhrInstance.onload?.();
  }

  function triggerError() {
    xhrInstance.onerror?.();
  }

  it('no incluye Content-Type (XHR gestiona el boundary automáticamente)', async () => {
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), 'token');
    triggerLoad();
    await promise;
    expect(xhrInstance.setRequestHeader).not.toHaveBeenCalledWith(
      'Content-Type',
      expect.anything(),
    );
  });

  it('incluye Authorization cuando se proporciona token', async () => {
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), 'mi-token');
    triggerLoad();
    await promise;
    expect(xhrInstance.setRequestHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer mi-token',
    );
  });

  it('no incluye Authorization cuando el token es null', async () => {
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), null);
    triggerLoad();
    await promise;
    expect(xhrInstance.setRequestHeader).not.toHaveBeenCalledWith(
      'Authorization',
      expect.anything(),
    );
  });

  it('resuelve con el JSON de respuesta en éxito 200', async () => {
    xhrInstance.responseText = JSON.stringify({ avatar: 'https://cdn.example.com/x.jpg' });
    const promise = uploadFile<{ avatar: string }>(
      '/api/v1/users/me/avatar',
      new FormData(),
      'token',
    );
    triggerLoad();
    const result = await promise;
    expect(result).toEqual({ avatar: 'https://cdn.example.com/x.jpg' });
  });

  it('rechaza con ApiRequestError cuando status >= 400', async () => {
    xhrInstance.status = 400;
    xhrInstance.responseText = JSON.stringify({ error: 'Bad request', code: 'VALIDATION_ERROR' });
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), 'token');
    triggerLoad();
    await expect(promise).rejects.toMatchObject({
      name: 'ApiRequestError',
      statusCode: 400,
      apiError: { code: 'VALIDATION_ERROR' },
    });
  });

  it('rechaza con ApiRequestError code=NETWORK_ERROR en error de red', async () => {
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), 'token');
    triggerError();
    await expect(promise).rejects.toMatchObject({
      name: 'ApiRequestError',
      statusCode: 0,
      apiError: { code: 'NETWORK_ERROR' },
    });
  });

  it('ApiRequestError.retryAfterSeconds se rellena en respuesta 429', async () => {
    xhrInstance.status = 429;
    xhrInstance.responseText = JSON.stringify({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
    xhrInstance.getResponseHeader.mockReturnValue('30');
    const promise = uploadFile('/api/v1/users/me/avatar', new FormData(), 'token');
    triggerLoad();
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).retryAfterSeconds).toBe(30);
  });
});

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
