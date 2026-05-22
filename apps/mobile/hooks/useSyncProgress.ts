import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncCompleteEvent, SyncErrorEvent, SyncProgressEvent, SyncStatusResponse } from '@unlockhub/types';

import { connectSocket, getSocket } from '../lib/socket';
import { useSessionStore } from '../stores/sessionStore';
import { api } from '../lib/api';

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

export function useSyncProgress(onComplete?: SyncCompleteCallback): UseSyncProgressResult {
  const { accessToken, isAuthenticated } = useSessionStore();
  const queryClient = useQueryClient();
  const [activeSyncs, setActiveSyncs] = useState<Map<string, SyncProgressState>>(new Map());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timestamp del último evento Socket.io recibido — para detectar si el socket está recibiendo datos
  const lastSocketEventRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          // limpiar el mapa para evitar banners de sync que quedaron huérfanos
          setActiveSyncs(new Map());
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
    } catch {
      // Si falla el poll, no mostrar error — el socket lo cubrirá cuando haya eventos
    }
  }, [stopPolling]);

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
      void queryClient.invalidateQueries({ queryKey: ['my-games'] });
    };

    const onSyncComplete = (event: SyncCompleteEvent) => {
      lastSocketEventRef.current = Date.now();
      setActiveSyncs((prev) => {
        const next = new Map(prev);
        next.delete(event.platform);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['my-games'] });
      // Refrescar XP/nivel y rankings tras el sync
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
    const gracePollTimer = setInterval(() => {
      const silenceDuration = Date.now() - lastSocketEventRef.current;
      setActiveSyncs((current) => {
        if (current.size > 0 && silenceDuration > SOCKET_GRACE_MS) {
          void hydrateFromApi(true);
          // Iniciar polling continuo si aún hay syncs activos
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(() => void hydrateFromApi(true), POLL_INTERVAL_MS);
          }
        } else if (current.size === 0) {
          stopPolling();
        }
        return current;
      });
    }, SOCKET_GRACE_MS);

    return () => {
      socket.off('sync:progress', onSyncProgress);
      socket.off('sync:complete', onSyncComplete);
      socket.off('sync:error', onSyncError);
      clearInterval(gracePollTimer);
      stopPolling();
    };
  }, [isAuthenticated, accessToken, queryClient, hydrateFromApi, stopPolling]);

  return {
    activeSyncs,
    isRunning: activeSyncs.size > 0,
  };
}
