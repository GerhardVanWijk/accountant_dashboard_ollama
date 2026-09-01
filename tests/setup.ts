import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { configure } from '@testing-library/dom';

/**
 * Phase 7 (print/export): every page that wires up ExportMenu also renders
 * a `<PrintableReport>` alongside the interactive view — a second, real
 * `<table>` with the SAME row text, kept in the DOM at all times (only
 * `hidden print:block`, a CSS class jsdom doesn't apply) so `window.print()`
 * can show it. Without this, `getByText`/`getByRole` queries against
 * ordinary row content become ambiguous ("Found multiple elements") in
 * EVERY test for EVERY page that exports, not just the ones this phase
 * touched directly. `PrintableReport`'s root carries `data-print-only="true"`
 * and `defaultIgnore` here tells text queries to skip it. Deliberately NOT
 * scoped off `aria-hidden` in general — Base UI's Dialog/Sheet/Dropdown
 * primitives legitimately apply `aria-hidden="true"` to background content
 * while a portal is open, and a real regression
 * (src/features/banking/components/ReconciliationWorkspace.test.tsx —
 * "Line 1 of 3" went unqueryable once its ancestor sheet was open) showed
 * that ignoring all `aria-hidden` content blinds queries to real, currently-
 * visible UI too.
 */
configure({ defaultIgnore: 'script, style, [data-print-only="true"], [data-print-only="true"] *' });

/**
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED LIVE-SUPABASE GUARD — primary layer (Phase 21 incident "JE-0171")
 * ─────────────────────────────────────────────────────────────────────────
 * A subagent once exercised the real, live-wired `bankTransactionService`
 * singleton from a test and posted a duplicate journal entry to the
 * PRODUCTION Supabase project — corrupting Bank GL + AR and destroying a
 * deliberate reconciliation training scenario. Books stayed globally
 * balanced, so no cheap check caught it.
 *
 * `vi.mock` in a setup file applies to EVERY test file (Vitest docs:
 * "Config | setupFiles"), with no per-test opt-in. Here it replaces the
 * shared `supabase` client with a Proxy whose every property access / call
 * THROWS a clear, actionable error. Any test — existing or future — that
 * touches the real client (directly, or transitively via a service barrel /
 * hook / page) fails loudly and immediately instead of silently mutating
 * production.
 *
 * A test that legitimately needs the Supabase surface stubs it the normal
 * way — a per-file `vi.mock('@/config/supabase', () => ({ supabase: {...} }))`
 * (as the auth tests already do) overrides this global mock for that file,
 * or it injects a `Mock*Repository` / in-memory fake into the service under
 * test. A real LIVE integration test must go through
 * `getTestSupabaseClient()` with `VITE_TEST_SUPABASE_URL` set.
 */
vi.mock('@/config/supabase', () => {
  const message =
    'Live Supabase client accessed from a test. Use a mock repository (Mock*Repository) or an in-memory fake, ' +
    'or add a per-file vi.mock("@/config/supabase", ...) with just the surface you need. ' +
    'For a genuine LIVE integration test, set VITE_TEST_SUPABASE_URL to a throwaway NON-production project ' +
    'and go through getTestSupabaseClient() — see docs/TESTING_SUPABASE.md.';

  const fail = (accessed: string): never => {
    throw new Error(`${message} (accessed: supabase.${accessed})`);
  };

  const guard: unknown = new Proxy(
    function liveSupabaseClientGuard() {
      /* not callable */
    },
    {
      get: (_target, prop) => {
        if (typeof prop === 'symbol') return undefined;
        // Let `await supabase` / thenable checks resolve to a non-thenable
        // rather than throw an unhelpful stack.
        if (prop === 'then') return undefined;
        return fail(String(prop));
      },
      apply: () => fail('()'),
      construct: () => fail('new'),
    },
  );

  return {
    supabase: guard,
    isTestContext: () => true,
    getTestSupabaseClient: () => {
      throw new Error(
        'getTestSupabaseClient() is not available under the global test mock. ' +
          'A live integration test must import the real module (vi.importActual) with VITE_TEST_SUPABASE_URL set.',
      );
    },
    __isLiveSupabaseGuard: true,
  };
});

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
 * jsdom has no `ResizeObserver`. cmdk (the command palette behind the global
 * search) instantiates one on mount to keep its list sized. A no-op stub is
 * enough — no test asserts on resize-driven behaviour, and real browsers
 * provide the real thing.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  if (typeof window !== 'undefined') {
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }
}

/**
 * jsdom implements no `Element.prototype.scrollIntoView`. cmdk calls it to
 * keep the highlighted command-palette item in view. A no-op keeps the
 * component mounting cleanly in tests.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
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
