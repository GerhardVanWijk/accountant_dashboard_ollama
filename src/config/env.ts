/**
 * Typed accessor for build-time environment variables. See
 * docs/ARCHITECTURE.md § Environment Variables and .env.local.example.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL ?? '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
} as const;
