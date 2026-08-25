import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { RouteGuard } from './RouteGuard';
import { useAuthStore } from '@/stores/authStore';
import type { Profile } from '@/types';

/**
 * Isolated routing-logic tests for RouteGuard's M6 root-gating branch
 * (docs/SUPABASE_MIGRATION_GUIDE.md) — a minimal route tree stands in for
 * the real AppLayout/DashboardPage subtree, so this exercises RouteGuard's
 * own decision (public homepage vs. real protected content vs. redirect)
 * without pulling in Dashboard's data-fetching hooks or PermissionsLoader's
 * network calls (both already covered by their own dedicated tests).
 */
const FAKE_SESSION = { user: { id: 'user_1' } } as unknown as Session;

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user_1',
    role: 'accountant',
    companyId: 'company_1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <RouteGuard />,
        children: [
          { index: true, element: <div>Real Dashboard route reached</div> },
          { path: 'reports', element: <div>Reports route reached</div> },
        ],
      },
      { path: '/login', element: <div>Login page</div> },
      { path: '/onboarding', element: <div>Onboarding page</div> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RouteGuard', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, profile: null, status: 'unauthenticated' });
  });

  it('shows the real public homepage at "/" for an unauthenticated visitor, not a redirect to /login', () => {
    renderAt('/');
    // The real HomePage (src/features/marketing/pages/HomePage.tsx) is
    // rendered for real here — its Sign In CTA and hero copy are genuine
    // marketing content, safe to mount (no data fetching). v0's Button
    // renders as an <a href> with an explicit role="button" (base-ui), so
    // it's queried as a button, not a link.
    expect(screen.getAllByRole('button', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('still redirects an unauthenticated visitor away from any other protected path (only "/" gets the homepage exception)', () => {
    renderAt('/reports');
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Reports route reached')).not.toBeInTheDocument();
  });

  it('renders the real protected content at "/" for an authenticated user with a company (unchanged from before M6)', () => {
    useAuthStore.setState({ session: FAKE_SESSION, profile: baseProfile(), status: 'authenticated' });
    renderAt('/');
    expect(screen.getByText('Real Dashboard route reached')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('still sends an authenticated user with no company yet to /onboarding, not the homepage', () => {
    useAuthStore.setState({ session: FAKE_SESSION, profile: baseProfile({ companyId: undefined }), status: 'authenticated' });
    renderAt('/');
    expect(screen.getByText('Onboarding page')).toBeInTheDocument();
  });
});
