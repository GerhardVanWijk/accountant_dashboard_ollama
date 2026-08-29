/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OLLAMA_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * Opt-in target for a LIVE Supabase integration test. Must point at a
   * throwaway / non-production project and must differ from
   * VITE_SUPABASE_URL. Absent ⇒ tests fail closed and never touch a real
   * Supabase project. See src/config/supabase.ts and tests/setup.ts.
   */
  readonly VITE_TEST_SUPABASE_URL?: string;
  readonly VITE_TEST_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Set to "true" by Vitest while a test run is in progress. */
  readonly VITEST?: string | boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
