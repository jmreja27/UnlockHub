import { create } from 'zustand';

import type { User } from '@unlockhub/types';

interface SessionState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  clearSession: () => set({ user: null, isAuthenticated: false }),
}));
