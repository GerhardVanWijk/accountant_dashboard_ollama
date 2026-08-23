import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Single shared Supabase client for the whole app (Phase B of
 * docs/SUPABASE_MIGRATION_GUIDE.md). Every `SupabaseXxxRepository` takes
 * this instance via constructor injection — same "one client/instance,
 * injected everywhere" pattern this codebase already uses for
 * `journalEntryService`/`auditLogService`/etc. Never imported directly by a
 * component or hook; only repositories should ever see it, mirroring
 * docs/ARCHITECTURE.md's "components -> hooks -> services -> repositories"
 * rule.
 *
 * Uses the publishable (anon) key — safe for client-side code, since real
 * access control is enforced by the RLS policies created in Phase A, not by
 * keeping this key secret.
 */
if (!env.supabaseUrl || !env.supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — set them in .env.local (see .env.local.example).',
  );
}

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey);
