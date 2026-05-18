import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncCompleteEvent, SyncErrorEvent, SyncProgressEvent } from '@unlockhub/types';

import { connectSocket, getSocket } from '../lib/socket';
import { useSessionStore } from '../stores/sessionStore';

export interface SyncProgressState {
  isRunning: boolean;
  platform: string | null;
  processed: number;
  total: number;
  percentComplete: number;
  newGamesCount: number;
  newAchievementsCount: number;
}

const INITIAL_STATE: SyncProgressState = {
  isRunning: false,
  platform: null,
  processed: 0,
  total: 0,
  percentComplete: 0,
  newGamesCount: 0,
  newAchievementsCount: 0,
};

export type SyncCompleteCallback = (event: SyncCompleteEvent) => void;

export function useSyncProgress(onComplete?: SyncCompleteCallback) {
  const { accessToken, isAuthenticated } = useSessionStore();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgressState>(INITIAL_STATE);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    connectSocket(accessToken);
    const socket = getSocket();

    const onSyncProgress = (event: SyncProgressEvent) => {
      setProgress({
        isRunning: true,
        platform: event.platform,
        processed: event.processed,
        total: event.total,
        percentComplete: event.percentComplete,
        newGamesCount: event.newGamesCount,
        newAchievementsCount: event.newAchievementsCount,
      });
      void queryClient.invalidateQueries({ queryKey: ['my-games'] });
    };

    const onSyncComplete = (event: SyncCompleteEvent) => {
      setProgress(INITIAL_STATE);
      void queryClient.invalidateQueries({ queryKey: ['my-games'] });
      onCompleteRef.current?.(event);
    };

    const onSyncError = (_event: SyncErrorEvent) => {
      setProgress(INITIAL_STATE);
    };

    socket.on('sync:progress', onSyncProgress);
    socket.on('sync:complete', onSyncComplete);
    socket.on('sync:error', onSyncError);

    return () => {
      socket.off('sync:progress', onSyncProgress);
      socket.off('sync:complete', onSyncComplete);
      socket.off('sync:error', onSyncError);
    };
  }, [isAuthenticated, accessToken, queryClient]);

  return progress;
}
