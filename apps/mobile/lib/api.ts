import * as SecureStore from 'expo-secure-store';
import type { ApiError } from '@unlockhub/types';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const REFRESH_TOKEN_KEY = 'unlockhub_refresh_token';

// Acceso lazy al store para evitar circular imports
function getAccessToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSessionStore } = require('../stores/sessionStore') as typeof import('../stores/sessionStore');
  return useSessionStore.getState().accessToken;
}

function setAccessToken(token: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

async function refreshAccessToken(): Promise<void> {
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
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
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

  constructor(apiError: ApiError, statusCode: number) {
    super(apiError.error);
    this.name = 'ApiRequestError';
    this.apiError = apiError;
    this.statusCode = statusCode;
  }
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
