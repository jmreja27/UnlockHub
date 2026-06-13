import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncCompleteEvent, SyncErrorEvent, SyncProgressEvent, SyncStatusResponse } from '@unlockhub/types';

import { connectSocket, getSocket } from '../lib/socket';
import { useSessionStore } from '../stores/sessionStore';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { analytics } from '../lib/analytics';

/** Estado de progreso de un sync activo para una plataforma concreta. */
export interface SyncProgressState {
  platform: string;
  processed: number;
  total: number;
  percentComplete: number;
  newGamesCount: number;
  newAchievementsCount: number;
}

export type SyncCompleteCallback = (event: SyncCompleteEvent) => void;

export interface UseSyncProgressResult {
  // Map de plataforma → estado de progreso (solo plataformas activas)
  activeSyncs: Map<string, SyncProgressState>;
  isRunning: boolean;
}

const POLL_INTERVAL_MS = 2000;
const SOCKET_GRACE_MS = 5000;
// Throttle de refresco de lista desde el path de polling (el socket no tiene throttle — emite por lote)
const LIST_INVALIDATE_THROTTLE_MS = 15_000;

/**
 * Hook que rastrea el progreso de syncs de plataforma en tiempo real.
 *
 * Estrategia dual:
 * - Primario: eventos Socket.io (sync:progress, sync:complete, sync:error).
 * - Fallback: polling de la API Redis cada 2s si el socket lleva > 5s silencioso.
 *
 * Invalida la caché 'my-games' en cada lote (Socket.io) o con throttle de 15s (fallback).
 * Soporta syncs concurrentes de múltiples plataformas mediante un Map keyed por plataforma.
 *
 * @param onComplete - Callback opcional llamado cuando un sync completa vía Socket.io.
 */
export function useSyncProgress(onComplete?: SyncCompleteCallback): UseSyncProgressResult {
  const { accessToken, isAuthenticated } = useSessionStore();
  const queryClient = useQueryClient();
  const [activeSyncs, setActiveSyncs] = useState<Map<string, SyncProgressState>>(new Map());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timestamp del último evento Socket.io recibido — para detectar si el socket está recibiendo datos
  const lastSocketEventRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gracePollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Timestamp del último invalidateQueries desde hydrateFromApi — throttle para no saturar la API
  const lastInvalidateRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Hidrata el map de syncs activos a partir de la respuesta de la API (Redis).
  // socketSilent=true: reconstruye el map desde cero (elimina plataformas que ya terminaron).
  // socketSilent=false (mount): solo añade plataformas nuevas, no elimina las que el socket ya tiene.
  const hydrateFromApi = useCallback(async (socketSilent = false) => {
    try {
      const statuses = await api.get<SyncStatusResponse[]>('/api/v1/sync/status');
      const running = statuses.filter((s) => s.isRunning && s.linked);

      if (running.length === 0) {
        if (socketSilent) {
          // El socket lleva tiempo silencioso y Redis confirma que no hay nada en curso:
          // limpiar el mapa y hacer un refresco final de la lista con el estado definitivo
          setActiveSyncs(new Map());
          void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
        }
        stopPolling();
        return;
      }

      setActiveSyncs((prev) => {
        // socketSilent=true: partir de mapa vacío para eliminar plataformas ya completadas
        const next = socketSilent ? new Map<string, SyncProgressState>() : new Map(prev);
        for (const s of running) {
          if (!next.has(s.platform)) {
            next.set(s.platform, {
              platform: s.platform,
              processed: s.processed,
              total: s.total,
              percentComplete: s.percentComplete,
              newGamesCount: 0,
              newAchievementsCount: 0,
            });
          }
        }
        return next;
      });

      // Throttle: refrescar la lista como máximo cada LIST_INVALIDATE_THROTTLE_MS.
      // El path de Socket.io tiene su propio invalidateQueries en onSyncProgress (sin throttle,
      // se ejecuta por cada lote). Este path de fallback es más conservador para no saturar la API
      // durante syncs largos (PSN ~300 juegos = 30+ minutos de polling cada 2s).
      const now = Date.now();
      if (now - lastInvalidateRef.current >= LIST_INVALIDATE_THROTTLE_MS) {
        lastInvalidateRef.current = now;
        void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
      }
    } catch {
      // Si falla el poll, no mostrar error — el socket lo cubrirá cuando haya eventos
    }
  }, [stopPolling, queryClient]);

  // BUG-8: En mount, comprobar si hay syncs en curso vía API para no depender solo del socket
  useEffect(() => {
    if (!isAuthenticated) return;
    void hydrateFromApi();
  }, [isAuthenticated, hydrateFromApi]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    connectSocket(accessToken);
    const socket = getSocket();

    const onSyncProgress = (event: SyncProgressEvent) => {
      lastSocketEventRef.current = Date.now();
      stopPolling(); // Socket.io está activo — no necesitamos polling

      setActiveSyncs((prev) => {
        const next = new Map(prev);
        next.set(event.platform, {
          platform: event.platform,
          processed: event.processed,
          total: event.total,
          percentComplete: event.percentComplete,
          newGamesCount: event.newGamesCount,
          newAchievementsCount: event.newAchievementsCount,
        });
        return next;
      });
      // Throttle igual al path de polling: evita 30+ invalidaciones en un sync PSN grande.
      // La lista se refresca como máximo cada LIST_INVALIDATE_THROTTLE_MS.
      const now = Date.now();
      if (now - lastInvalidateRef.current >= LIST_INVALIDATE_THROTTLE_MS) {
        lastInvalidateRef.current = now;
        void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
      }
    };

    const onSyncComplete = (event: SyncCompleteEvent) => {
      lastSocketEventRef.current = Date.now();
      void analytics.syncCompleted(event.platform);
      setActiveSyncs((prev) => {
        const next = new Map(prev);
        next.delete(event.platform);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
      // Refrescar XP/nivel y rankings tras el sync
      void queryClient.invalidateQueries({ queryKey: queryKeys.userStats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rankings() });
      onCompleteRef.current?.(event);
    };

    const onSyncError = (event: SyncErrorEvent) => {
      lastSocketEventRef.current = Date.now();
      setActiveSyncs((prev) => {
        const next = new Map(prev);
        next.delete(event.platform);
        return next;
      });
    };

    socket.on('sync:progress', onSyncProgress);
    socket.on('sync:complete', onSyncComplete);
    socket.on('sync:error', onSyncError);

    // BUG-8: Si hay syncs activos pero el socket no emite eventos en SOCKET_GRACE_MS,
    // activar polling de fallback vía Redis para no dejar la barra stuckeada.
    // En modo socketSilent=true, hydrateFromApi reconstruye el map desde cero,
    // eliminando plataformas que terminaron mientras el socket estuvo desconectado.
    let unmounted = false;

    gracePollTimerRef.current = setInterval(() => {
      const silenceDuration = Date.now() - lastSocketEventRef.current;
      setActiveSyncs((current) => {
        if (current.size > 0 && silenceDuration > SOCKET_GRACE_MS) {
          void hydrateFromApi(true);
          // Iniciar polling continuo solo si el componente sigue montado
          if (!pollTimerRef.current && !unmounted) {
            pollTimerRef.current = setInterval(() => void hydrateFromApi(true), POLL_INTERVAL_MS);
          }
        } else if (current.size === 0) {
          stopPolling();
        }
        return current;
      });
    }, SOCKET_GRACE_MS);

    return () => {
      unmounted = true;
      socket.off('sync:progress', onSyncProgress);
      socket.off('sync:complete', onSyncComplete);
      socket.off('sync:error', onSyncError);
      if (gracePollTimerRef.current) {
        clearInterval(gracePollTimerRef.current);
        gracePollTimerRef.current = null;
      }
      stopPolling();
    };
  }, [isAuthenticated, accessToken, queryClient, hydrateFromApi, stopPolling]);

  return {
    activeSyncs,
    isRunning: activeSyncs.size > 0,
  };
}
