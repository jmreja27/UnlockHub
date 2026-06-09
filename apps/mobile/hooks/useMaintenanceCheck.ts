import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 30_000;

interface HealthResponse {
  status: string;
  maintenance: boolean;
}

export function useMaintenanceCheck() {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    try {
      const controller = new AbortController();
      abortTimeoutRef.current = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      if (abortTimeoutRef.current) {
        clearTimeout(abortTimeoutRef.current);
        abortTimeoutRef.current = null;
      }
      const data = (await res.json()) as HealthResponse;
      setIsMaintenance(data.maintenance === true);
    } catch {
      // API inaccesible (red caída, servidor apagado) — no es mantenimiento activo,
      // dejar pasar al usuario. Solo bloqueamos si el servidor dice maintenance: true.
      setIsMaintenance(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Comprobación inicial al arrancar; cancela el timeout de abort pendiente al desmontar
  useEffect(() => {
    void check();
    return () => {
      if (abortTimeoutRef.current) {
        clearTimeout(abortTimeoutRef.current);
        abortTimeoutRef.current = null;
      }
    };
  }, [check]);

  // Polling automático cada 30s mientras está en mantenimiento
  useEffect(() => {
    if (isMaintenance) {
      intervalRef.current = setInterval(() => {
        void check();
      }, POLL_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMaintenance, check]);

  return { isMaintenance, isChecking, retry: check };
}
