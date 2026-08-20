/**
 * Typed accessor for build-time environment variables. See
 * docs/ARCHITECTURE.md § Environment Variables and .env.local.example.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL ?? '',
} as const;
