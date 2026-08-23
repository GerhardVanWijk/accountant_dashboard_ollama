import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import { supabase } from '@/config/supabase';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  status: AuthStatus;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  /** Kept as a void, argument-less function — Topbar/MobileNavMenu wire this directly to an onClick handler. The real sign-out (and clearing session/profile) happens via the onAuthStateChange listener src/features/auth/bootstrapAuth.ts sets up, not here. */
  logout: () => void;
}

/**
 * Real session/profile store (Phase T) — replaces the Phase-0
 * `isAuthenticated` boolean stub. No zustand `persist` middleware: the
 * Supabase client already persists its own session in localStorage
 * (`createClient`'s default `auth.persistSession: true`), so mirroring
 * that here would just be a second, driftable copy of the same state.
 * Populated by src/features/auth/bootstrapAuth.ts, read by
 * src/app/RouteGuard.tsx and anywhere that needs "who's signed in".
 */
export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  status: 'loading',
  setSession: (session) => set({ session, status: session ? 'authenticated' : 'unauthenticated' }),
  setProfile: (profile) => set({ profile }),
  logout: () => {
    supabase.auth.signOut().catch((error) => {
      console.error('Sign-out failed:', error);
    });
  },
}));
