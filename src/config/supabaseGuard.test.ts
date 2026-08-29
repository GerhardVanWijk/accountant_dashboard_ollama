import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabase } from '@/config/supabase';

/**
 * Regression coverage for the fail-closed live-Supabase guard
 * (Phase 21 incident "JE-0171"). See docs/TESTING_SUPABASE.md.
 */

describe('layer (a) — global test mock replaces the live client with a throwing Proxy', () => {
  it('throws on any property access (e.g. supabase.from)', () => {
    expect(() =>
      (supabase as unknown as { from: (t: string) => unknown }).from('journal_entries'),
    ).toThrow(/Live Supabase client accessed from a test/);
  });

  it('throws when the client is called as a function', () => {
    expect(() => (supabase as unknown as () => void)()).toThrow(
      /Live Supabase client accessed from a test/,
    );
  });

  it('throws for a nested call like supabase.auth.getUser()', () => {
    expect(() => (supabase as unknown as { auth: unknown }).auth).toThrow(
      /Live Supabase client accessed from a test/,
    );
  });
});

describe('layer (b) — load-time guard in the real module', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws when constructing the real client in test MODE with no VITE_TEST_SUPABASE_URL', async () => {
    vi.resetModules();
    await expect(vi.importActual('@/config/supabase')).rejects.toThrow(
      /Refusing to construct a live Supabase client in a test run/,
    );
  });

  it('fails closed — does NOT fall back to the production env vars', async () => {
    // The production vars ARE loaded in this run (from .env.local); the
    // guard must refuse rather than quietly use them.
    expect(import.meta.env.VITE_SUPABASE_URL).toBeTruthy();
    vi.resetModules();
    await expect(vi.importActual('@/config/supabase')).rejects.toThrow(
      /production VITE_SUPABASE_URL is never used from a test/,
    );
  });

  it('refuses a test URL that equals the production URL', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TEST_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL as string);
    vi.stubEnv('VITE_TEST_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_dummy_for_test');
    await expect(vi.importActual('@/config/supabase')).rejects.toThrow(
      /must differ from the production VITE_SUPABASE_URL/,
    );
  });

  it('constructs a real client fine in a simulated production build (MODE=production)', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITEST', '');
    const actual = await vi.importActual<typeof import('@/config/supabase')>(
      '@/config/supabase',
    );
    expect(actual.supabase).toBeDefined();
    expect(typeof actual.supabase.from).toBe('function');
    expect(actual.isTestContext()).toBe(false);
  });

  it('constructs a real client fine in development (MODE=development)', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITEST', '');
    const actual = await vi.importActual<typeof import('@/config/supabase')>(
      '@/config/supabase',
    );
    expect(actual.supabase).toBeDefined();
    expect(typeof actual.supabase.from).toBe('function');
  });
});

describe('layer (c) — getTestSupabaseClient() door is lockable', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws unless VITE_TEST_SUPABASE_URL + key are configured', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'development'); // so the module itself loads
    vi.stubEnv('VITEST', '');
    const actual = await vi.importActual<typeof import('@/config/supabase')>(
      '@/config/supabase',
    );
    expect(() => actual.getTestSupabaseClient()).toThrow(
      /requires VITE_TEST_SUPABASE_URL and VITE_TEST_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('throws if the configured test URL equals the production URL', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('VITE_TEST_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL as string);
    vi.stubEnv('VITE_TEST_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_dummy_for_test');
    const actual = await vi.importActual<typeof import('@/config/supabase')>(
      '@/config/supabase',
    );
    expect(() => actual.getTestSupabaseClient()).toThrow(/must differ from the production/);
  });
});
