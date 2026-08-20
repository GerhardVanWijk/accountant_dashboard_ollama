import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  /** Stub sign-in — replaced by real auth in a later phase. */
  login: () => void;
  logout: () => void;
}

/**
 * Minimal auth stub backing the route guard (src/app/RouteGuard.tsx).
 * Phase 0 only needs a boolean gate to prove the protected route tree
 * works; the auth feature module builds the real thing later.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: () => set({ isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false }),
    }),
    { name: 'accounting-suite-auth' },
  ),
);
