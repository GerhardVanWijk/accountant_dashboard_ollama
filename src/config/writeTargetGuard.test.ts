import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertDemoWriteTarget, assertDestructiveResetAllowed } from './writeTargetGuard';

/**
 * Regression coverage for the seed/reset/demo write-target guard
 * (Phase 21 incident "JE-0171"). See docs/TESTING_SUPABASE.md.
 */

const PROD_URL = import.meta.env.VITE_SUPABASE_URL as string;
const LOCAL_URL = 'http://localhost:54321';
const DEMO_URL = 'https://throwaway-demo-ref.supabase.co';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertDemoWriteTarget', () => {
  it('rejects when VERTEX_DB_TARGET is unset', () => {
    expect(() => assertDemoWriteTarget({ resolvedUrl: LOCAL_URL, toolName: 'seed' })).toThrow(
      /VERTEX_DB_TARGET=demo/,
    );
  });

  it('rejects a non-demo target like "production"', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'production');
    expect(() => assertDemoWriteTarget({ resolvedUrl: LOCAL_URL, toolName: 'seed' })).toThrow(
      /never runs against production/,
    );
  });

  it('rejects the production Supabase URL even with VERTEX_DB_TARGET=demo', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'demo');
    expect(() => assertDemoWriteTarget({ resolvedUrl: PROD_URL, toolName: 'seed' })).toThrow(
      /production Supabase URL/,
    );
  });

  it('rejects an arbitrary remote URL that is neither local nor allowlisted', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'demo');
    expect(() =>
      assertDemoWriteTarget({ resolvedUrl: DEMO_URL, toolName: 'seed' }),
    ).toThrow(/must be a local Supabase stack or exactly match VERTEX_DEMO_SUPABASE_URL/);
  });

  it('allows a local stack with VERTEX_DB_TARGET=local', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'local');
    expect(() =>
      assertDemoWriteTarget({ resolvedUrl: LOCAL_URL, toolName: 'seed' }),
    ).not.toThrow();
  });

  it('allows an explicitly allowlisted demo URL', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'demo');
    vi.stubEnv('VERTEX_DEMO_SUPABASE_URL', DEMO_URL);
    expect(() =>
      assertDemoWriteTarget({ resolvedUrl: DEMO_URL, toolName: 'seed' }),
    ).not.toThrow();
  });
});

describe('assertDestructiveResetAllowed', () => {
  it('rejects even a valid demo target without the destructive opt-in', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'local');
    expect(() =>
      assertDestructiveResetAllowed({ resolvedUrl: LOCAL_URL, toolName: 'reset' }),
    ).toThrow(/VERTEX_ALLOW_DESTRUCTIVE_RESET=yes/);
  });

  it('allows a local reset with both the target and the destructive opt-in', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'local');
    vi.stubEnv('VERTEX_ALLOW_DESTRUCTIVE_RESET', 'yes');
    expect(() =>
      assertDestructiveResetAllowed({ resolvedUrl: LOCAL_URL, toolName: 'reset' }),
    ).not.toThrow();
  });

  it('still rejects production even with the destructive opt-in', () => {
    vi.stubEnv('VERTEX_DB_TARGET', 'demo');
    vi.stubEnv('VERTEX_ALLOW_DESTRUCTIVE_RESET', 'yes');
    expect(() =>
      assertDestructiveResetAllowed({ resolvedUrl: PROD_URL, toolName: 'reset' }),
    ).toThrow(/production Supabase URL/);
  });
});
