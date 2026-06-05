import { useQuery } from '@tanstack/react-query';
import type { GamingWrapped } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { queryKeys } from '../lib/queryKeys';

// Acepta tanto un año numérico (anual) como un string de período "YYYY-MM" (mensual).
export function useWrapped(period: number | string) {
  const { isAuthenticated } = useSessionStore();

  const periodStr = String(period);
  const isValid = typeof period === 'number'
    ? period >= 2024
    : /^\d{4}(-\d{2})?$/.test(periodStr);

  return useQuery({
    queryKey: queryKeys.wrapped(periodStr),
    queryFn: () =>
      api
        .get<{ wrapped: GamingWrapped }>(`/api/v1/wrapped/${periodStr}`)
        .then((r) => r.wrapped),
    enabled: isAuthenticated && isValid,
    staleTime: 1000 * 60 * 60,
  });
}
