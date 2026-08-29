import { env } from './env';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED WRITE-TARGET GUARD for seed / reset / repair / demo tooling
 * ─────────────────────────────────────────────────────────────────────────
 * Companion to the test guard in src/config/supabase.ts (Phase 21 incident
 * "JE-0171"). That one stops *tests* reaching production; this one stops
 * *destructive utilities* (bulk seed, reset, posting-repair, demo-data
 * loaders) reaching production.
 *
 * STATUS TODAY: there is NO live-write tooling in this repo. Every fixture
 * under `src/mock-data/` and the per-feature `testFixtures/` folders is
 * pure, synchronous, in-memory data with zero persistence — see
 * `demoReconciliationScenario.ts`'s SCOPE note ("TEST FIXTURE / dev helper
 * ONLY … must NOT be inserted into the live database … no production
 * 'Seed demo data' button"). `generateSeedPostings.ts` only returns a
 * `JournalEntry[]`.
 *
 * This module exists so that IF such tooling is ever added, there is a
 * single lockable door it MUST pass through. The rules, deliberately:
 *
 *   • An explicit target env var — `VERTEX_DB_TARGET` — must equal `demo`
 *     or `local`. Unset / `production` / anything else ⇒ refuse.
 *   • The resolved write URL must NOT equal the app's configured
 *     production URL (`VITE_SUPABASE_URL`).
 *   • The resolved write URL must be a local stack OR exactly match an
 *     explicitly-configured `VERTEX_DEMO_SUPABASE_URL` allowlist entry.
 *   • "Supabase credentials are present" is NEVER treated as "safe to
 *     write".
 *   • A destructive reset additionally requires
 *     `VERTEX_ALLOW_DESTRUCTIVE_RESET=yes`.
 */

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
}

const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|[a-z0-9-]+\.local)(:\d+)?(\/|$)/i;

export interface WriteTargetOptions {
  /** The Supabase (or other DB) URL the tool is about to write to. */
  resolvedUrl: string;
  /** Human-readable name of the tool, for error messages. */
  toolName: string;
}

/**
 * Throws unless it is provably safe for a data-writing utility to run
 * against `resolvedUrl`. Call this at the very top of any seed / demo /
 * import utility's `main()` before opening a client.
 */
export function assertDemoWriteTarget({ resolvedUrl, toolName }: WriteTargetOptions): void {
  const target = readEnv('VERTEX_DB_TARGET');
  if (target !== 'demo' && target !== 'local') {
    throw new Error(
      `${toolName}: refusing to run. Set VERTEX_DB_TARGET=demo (or =local) to run data-writing tooling. ` +
        `Got: ${target ?? '<unset>'}. This never runs against production.`,
    );
  }

  if (!resolvedUrl) {
    throw new Error(`${toolName}: refusing to run — no write URL resolved.`);
  }

  if (env.supabaseUrl && resolvedUrl === env.supabaseUrl) {
    throw new Error(
      `${toolName}: refusing to run against the production Supabase URL (VITE_SUPABASE_URL). ` +
        `Point it at a local stack or a dedicated demo project.`,
    );
  }

  const isLocal = LOCAL_URL_RE.test(resolvedUrl);
  const allowlisted = readEnv('VERTEX_DEMO_SUPABASE_URL');
  if (!isLocal && resolvedUrl !== allowlisted) {
    throw new Error(
      `${toolName}: refusing to run. The write target must be a local Supabase stack ` +
        `or exactly match VERTEX_DEMO_SUPABASE_URL. Got: ${resolvedUrl}`,
    );
  }
}

/**
 * Stricter gate for a utility that DELETES or truncates data. Everything
 * `assertDemoWriteTarget` requires, plus an explicit destructive opt-in.
 */
export function assertDestructiveResetAllowed(options: WriteTargetOptions): void {
  assertDemoWriteTarget(options);
  if (readEnv('VERTEX_ALLOW_DESTRUCTIVE_RESET') !== 'yes') {
    throw new Error(
      `${options.toolName}: refusing to run a destructive reset. ` +
        `Set VERTEX_ALLOW_DESTRUCTIVE_RESET=yes (in addition to VERTEX_DB_TARGET=demo|local) to proceed.`,
    );
  }
}
