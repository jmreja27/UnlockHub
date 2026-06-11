import * as SecureStore from 'expo-secure-store';
import type { ApiError } from '@unlockhub/types';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const REFRESH_TOKEN_KEY = 'unlockhub_refresh_token';

// Acceso lazy al store para evitar circular imports
export function getAccessToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
  const { useSessionStore } = require('../stores/sessionStore') as typeof import('../stores/sessionStore');
  return useSessionStore.getState().accessToken;
}

function setAccessToken(token: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
  const { useSessionStore } = require('../stores/sessionStore') as typeof import('../stores/sessionStore');
  useSessionStore.getState().setAccessToken(token);
}

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function deleteRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// Marca interna para evitar bucles infinitos durante el refresh
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export async function refreshAccessToken(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('Sin refresh token. Inicia sesión de nuevo.');

  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');

  const data = (await response.json()) as RefreshResponse;
  setAccessToken(data.accessToken);
  await saveRefreshToken(data.refreshToken);
}

interface RequestOptions extends RequestInit {
  skipRefresh?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipRefresh = false, ...fetchOptions } = options;

  const url = `${API_URL}${path}`;
  const token = getAccessToken();
  const isFormData = fetchOptions.body instanceof FormData;
  const defaultHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      ...defaultHeaders,
      ...(fetchOptions.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 401 && !skipRefresh) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    await refreshPromise;

    const newToken = getAccessToken();
    const retryResponse = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...defaultHeaders,
        ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
        ...(fetchOptions.headers as Record<string, string> | undefined),
      },
    });

    if (!retryResponse.ok) {
      const errorData = (await retryResponse.json().catch(() => ({
        error: 'Error de servidor',
        code: 'SERVER_ERROR',
      }))) as ApiError;
      throw new ApiRequestError(errorData, retryResponse.status);
    }

    return retryResponse.json() as Promise<T>;
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    const errorData = (await response.json().catch(() => ({
      error: 'Demasiadas solicitudes. Espera antes de reintentar.',
      code: 'RATE_LIMITED',
    }))) as ApiError;
    throw new ApiRequestError(errorData, 429, retryAfterSeconds);
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: 'Error de servidor. Por favor, inténtalo de nuevo más tarde.',
      code: 'SERVER_ERROR',
    }))) as ApiError;
    throw new ApiRequestError(errorData, response.status);
  }

  if (response.status === 204) return undefined as unknown as T;

  return response.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  public readonly apiError: ApiError;
  public readonly statusCode: number;
  public readonly retryAfterSeconds?: number;

  constructor(apiError: ApiError, statusCode: number, retryAfterSeconds?: number) {
    super(apiError.error);
    this.name = 'ApiRequestError';
    this.apiError = apiError;
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface XhrResult { status: number; body: string; retryAfter: string | null; }

/**
 * Sube un archivo multipart usando XMLHttpRequest.
 * fetch en React Native no serializa { uri, name, type } correctamente en FormData — XHR sí lo hace.
 * NO incluye Content-Type: XHR gestiona el boundary automáticamente.
 */
export async function uploadFile<T = unknown>(
  path: string,
  formData: FormData,
  token: string | null,
): Promise<T> {
  const url = `${API_URL}${path}`;

  const doUpload = (authToken: string | null): Promise<XhrResult> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      if (authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      }

      xhr.onload = () =>
        resolve({
          status: xhr.status,
          body: xhr.responseText,
          retryAfter: xhr.getResponseHeader('Retry-After'),
        });
      xhr.onerror = () =>
        reject(
          new ApiRequestError(
            { error: 'Error de red. Por favor, inténtalo de nuevo.', code: 'NETWORK_ERROR' },
            0,
          ),
        );

      xhr.send(formData);
    });

  let result = await doUpload(token);

  if (result.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }
    await refreshPromise;

    const newToken = getAccessToken();
    result = await doUpload(newToken);
  }

  if (result.status >= 400) {
    let errorData: ApiError;
    try {
      errorData = JSON.parse(result.body) as ApiError;
    } catch {
      errorData = {
        error: 'Error de servidor. Por favor, inténtalo de nuevo más tarde.',
        code: 'SERVER_ERROR',
      };
    }
    const retryAfterSeconds =
      result.status === 429 && result.retryAfter
        ? parseInt(result.retryAfter, 10)
        : undefined;
    throw new ApiRequestError(errorData, result.status, retryAfterSeconds);
  }

  if (result.status === 204) return undefined as unknown as T;

  return JSON.parse(result.body) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
