import { create } from 'zustand';
import type { User } from '@unlockhub/types';

interface SessionState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setSession: (user: User, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  clearSession: () => void;
  // Mantenemos setUser por compatibilidad con código existente que lo llama
  setUser: (user: User) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  setSession: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
  setAccessToken: (token) => set({ accessToken: token }),
  clearSession: () => set({ user: null, accessToken: null, isAuthenticated: false }),
  setUser: (user) => set({ user, isAuthenticated: true }),
}));
