import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED TEST GUARD (Phase 21 incident "JE-0171", 2026-08-28)
 * ─────────────────────────────────────────────────────────────────────────
 * A subagent once exercised a real, live-wired service singleton from a
 * test and posted a duplicate journal entry to the PRODUCTION project,
 * corrupting a reconciliation training scenario. Primary protection is the
 * global `vi.mock('@/config/supabase', ...)` in tests/setup.ts, which
 * replaces `supabase` with a Proxy that throws on any access. This
 * load-time check is defense in depth: if that mock is ever bypassed, real
 * client construction in a test context fails immediately instead of
 * silently connecting to production.
 *
 * It fires ONLY in a test context (`MODE === 'test'` / Vitest's `VITEST`
 * flag). `MODE === 'development'` and `MODE === 'production'` are never
 * affected — the real app keeps working normally.
 */

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[key];
}

/**
 * True while running under Vitest / any `test` mode. Deliberately does NOT
 * consult anything that development or production builds set, so this guard
 * cannot misfire for the real app.
 */
export function isTestContext(): boolean {
  const vitestFlag = import.meta.env.VITEST ?? readProcessEnv('VITEST');
  return import.meta.env.MODE === 'test' || vitestFlag === true || vitestFlag === 'true';
}

const TEST_GUARD_HINT =
  'The primary protection is the global vi.mock in tests/setup.ts (replace the client with a Mock*Repository or an in-memory fake). ' +
  'If you genuinely need a LIVE integration test, set VITE_TEST_SUPABASE_URL to a throwaway, NON-production Supabase project ' +
  '(it must differ from VITE_SUPABASE_URL) — see docs/TESTING_SUPABASE.md. The production VITE_SUPABASE_URL is never used from a test.';

/**
 * Resolves the URL + key the client should be built with, throwing
 * fail-closed if a test run would otherwise reach the production project.
 */
function resolveClientConfig(): { url: string; key: string } {
  if (isTestContext()) {
    const testUrl = import.meta.env.VITE_TEST_SUPABASE_URL ?? '';
    if (!testUrl) {
      throw new Error(
        `Refusing to construct a live Supabase client in a test run. ${TEST_GUARD_HINT}`,
      );
    }
    if (testUrl === env.supabaseUrl) {
      throw new Error(
        'VITE_TEST_SUPABASE_URL must differ from the production VITE_SUPABASE_URL. ' +
          'Point tests at a dedicated throwaway Supabase project, never production.',
      );
    }
    const testKey =
      (import.meta.env.VITE_TEST_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
    if (!testKey) {
      throw new Error(
        'VITE_TEST_SUPABASE_URL is set but VITE_TEST_SUPABASE_PUBLISHABLE_KEY is not. ' +
          'Set the matching publishable key for the test project.',
      );
    }
    return { url: testUrl, key: testKey };
  }

  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — set them in .env.local (see .env.local.example).',
    );
  }
  return { url: env.supabaseUrl, key: env.supabasePublishableKey };
}

const { url, key } = resolveClientConfig();

export const supabase = createClient(url, key);

/**
 * Explicit door for a future LIVE Supabase integration test. Throws unless
 * `VITE_TEST_SUPABASE_URL` (+ key) is configured and differs from the
 * production URL. Never falls back to the production env vars. There is no
 * integration-test suite today — this only makes the door lockable.
 */
export function getTestSupabaseClient(): SupabaseClient {
  const testUrl = import.meta.env.VITE_TEST_SUPABASE_URL ?? '';
  const testKey =
    (import.meta.env.VITE_TEST_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
  if (!testUrl || !testKey) {
    throw new Error(
      `getTestSupabaseClient() requires VITE_TEST_SUPABASE_URL and VITE_TEST_SUPABASE_PUBLISHABLE_KEY. ${TEST_GUARD_HINT}`,
    );
  }
  if (testUrl === env.supabaseUrl) {
    throw new Error(
      'VITE_TEST_SUPABASE_URL must differ from the production VITE_SUPABASE_URL. Never run an integration test against production.',
    );
  }
  return createClient(testUrl, testKey);
}
