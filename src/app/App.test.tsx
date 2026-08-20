import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { App } from './App';
import { routes } from './router';

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
  it('renders the login page when unauthenticated (default state)', () => {
    renderAt('/login');
    expect(screen.getByRole('heading', { name: /accounting suite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from a protected route to /login', () => {
    renderAt('/reports');
    expect(screen.getByRole('heading', { name: /accounting suite/i })).toBeInTheDocument();
  });
});
