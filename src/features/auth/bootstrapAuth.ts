import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { profileService } from './services';

/**
 * Real session bootstrap (Phase T) — replaces `ensureAnonymousSession()`.
 * Awaited once in src/main.tsx before the first render, same rationale as
 * the function it replaces: every hook's first data-fetch should already
 * have a settled auth state rather than racing an unauthenticated render.
 *
 * Subscribes to onAuthStateChange for the app's whole lifetime (sign-in,
 * sign-out from Topbar/MobileNavMenu's `logout()`, token refresh, or a
 * session change in another tab) — this promise only resolves once the
 * *initial* state is known; later changes update the store directly.
 */
export async function bootstrapAuth(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  useAuthStore.getState().setSession(data.session);
  if (data.session) {
    const profile = await profileService.getById(data.session.user.id).catch(() => undefined);
    useAuthStore.getState().setProfile(profile ?? null);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
    if (!session) {
      useAuthStore.getState().setProfile(null);
      return;
    }
    profileService
      .getById(session.user.id)
      .then((profile) => useAuthStore.getState().setProfile(profile ?? null))
      .catch((error) => console.error('bootstrapAuth: failed to load profile after auth change:', error));
  });
}
