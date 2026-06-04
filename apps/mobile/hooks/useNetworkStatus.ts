import { useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    async function check() {
      const state = await Network.getNetworkStateAsync();
      const offline = !(state.isConnected && state.isInternetReachable);
      if (initialCheckDone.current || offline) {
        setIsOffline(offline);
      }
      initialCheckDone.current = true;
    }

    void check();

    const interval = setInterval(() => { void check(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  return { isOffline };
}
