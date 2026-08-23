import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { App } from './App';
import { routes } from './router';
import { useAuthStore } from '@/stores/authStore';

/**
 * createBrowserRouter doesn't play well with jsdom's AbortController in
 * this Node/undici combination during router.initialize(), so tests
 * inject a createMemoryRouter built from the same route config instead
 * (see App.tsx's optional `router` prop).
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<App router={router} />);
}

describe('App smoke test', () => {
  beforeEach(() => {
    // Phase T: real auth means RouteGuard reads useAuthStore's session
    // state, which nothing populates in a component test (main.tsx's
    // bootstrapAuth() only runs in the real browser entry point). Set the
    // signed-out state explicitly rather than leaving status stuck at its
    // default 'loading', which would render RouteGuard's loading
    // placeholder forever.
    useAuthStore.setState({ session: null, profile: null, status: 'unauthenticated' });
  });

  it('renders the login page when unauthenticated (default state)', () => {
    renderAt('/login');
    expect(screen.getByRole('heading', { name: /accounting suite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from a protected route to /login', () => {
    renderAt('/reports');
    expect(screen.getByRole('heading', { name: /accounting suite/i })).toBeInTheDocument();
  });
});
