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

/**
 * Workaround for another jsdom gap: `@base-ui/react`'s Checkbox/Button/etc.
 * "click" handling (dispatchClickWithModifiers) constructs a real
 * `PointerEvent` to replay a click with its original modifier keys — jsdom
 * has no `PointerEvent` constructor at all, so any `fireEvent.click()` on a
 * base-ui-driven control throws "ownerWindow(...).PointerEvent is not a
 * constructor" (first hit in M9, testing the Reports module's Checkbox
 * toggles). A minimal polyfill covering the fields
 * dispatchClickWithModifiers.mjs actually reads (bubbles/cancelable/
 * composed/detail/the four modifier keys) is enough — no real pointer
 * (pressure, pointerId, etc.) semantics are exercised by any test.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params);
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  if (typeof window !== 'undefined') {
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
}

/**
 * Workaround for a Node/jsdom `localStorage` interop gap: Node 22+ defines
 * its own experimental global `localStorage` (behind `--localstorage-file`,
 * unset here) which shadows jsdom's working `window.localStorage`
 * implementation on `globalThis`, so any store reading/writing
 * `globalThis.localStorage` (e.g. Zustand's `persist` middleware —
 * `useThemeStore`, first hit in M10 testing the real theme preference)
 * throws "Cannot read properties of undefined (reading 'setItem')". A
 * minimal in-memory Storage polyfill, assigned directly, is enough — no
 * test relies on values surviving across separate test files/processes.
 */
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.setItem !== 'function') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number {
      return this.store.size;
    }
    clear(): void {
      this.store.clear();
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null;
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    setItem(key: string, value: string): void {
      this.store.set(key, value);
    }
  }
  const memoryStorage = new MemoryStorage();
  globalThis.localStorage = memoryStorage;
  if (typeof window !== 'undefined') {
    window.localStorage = memoryStorage;
  }
}
