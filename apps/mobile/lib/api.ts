// Cliente HTTP centralizado con interceptores para refresh automático de tokens
import type { ApiError } from '@unlockhub/types';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// Marca interna para evitar bucles infinitos durante el refresh
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

// Realiza el refresh del access token usando el refresh token en cookie httpOnly
async function refreshAccessToken(): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
}

interface RequestOptions extends RequestInit {
  skipRefresh?: boolean;
}

// Función principal de la API: fetch con credenciales y reintento tras refresh
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipRefresh = false, ...fetchOptions } = options;

  const url = `${API_URL}${path}`;
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...(fetchOptions.headers as Record<string, string> | undefined),
    },
  });

  // Si recibimos 401 y no estamos ya en el proceso de refresh, intentamos refrescar
  if (response.status === 401 && !skipRefresh) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    // Esperamos a que el refresh termine (todos los requests concurrentes esperan el mismo)
    await refreshPromise;

    // Reintentamos la petición original con el nuevo token
    const retryResponse = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        ...defaultHeaders,
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

  // Respuesta vacía (204 No Content)
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// Error tipado con la estructura estándar de la API
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

// Helpers para los métodos HTTP más comunes
export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
