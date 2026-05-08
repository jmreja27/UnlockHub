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

  const check = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = (await res.json()) as HealthResponse;
      setIsMaintenance(data.maintenance === true);
    } catch {
      // API inaccesible — mostrar pantalla de mantenimiento como fallback
      setIsMaintenance(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Comprobación inicial al arrancar
  useEffect(() => {
    void check();
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
