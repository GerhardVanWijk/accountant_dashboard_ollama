import '@testing-library/jest-dom/vitest';

/**
 * Workaround for a jsdom/Node fetch interop gap: React Router's data
 * router constructs a `Request` internally on every navigation
 * (createClientSideRequest). Node's built-in fetch (undici) validates
 * that `RequestInit.signal` is an instance of ITS OWN AbortSignal class,
 * but the jsdom test environment installs a separate AbortController/
 * AbortSignal implementation — the mismatch throws
 * "RequestInit: Expected signal to be an instance of AbortSignal" on
 * every client-side route change, even though no real network request
 * is ever made (this app has no route loaders/actions). Swap in a
 * minimal Request stub for tests only; production code never touches
 * this file.
 */
class TestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal?: AbortSignal;

  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = typeof input === 'string' ? input : input.toString();
    this.method = init.method ?? 'GET';
    this.signal = init.signal ?? undefined;
  }

  clone(): TestRequest {
    return new TestRequest(this.url, { method: this.method, signal: this.signal });
  }
}

globalThis.Request = TestRequest as unknown as typeof Request;
