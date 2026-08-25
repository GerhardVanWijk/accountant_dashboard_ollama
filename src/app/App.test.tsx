import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { App } from './App';
import { routes } from './router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/config/supabase';

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

/**
 * LoginPage/SignUpPage/ForgotPasswordPage/ResetPasswordPage all call
 * `@/config/supabase`'s `supabase.auth.*` directly (no repository layer
 * wraps Supabase Auth in this codebase) — mocked here so these tests never
 * touch the network, per this app's "mock the auth boundary" testing
 * convention (docs/SUPABASE_MIGRATION_GUIDE.md's Testing note describes
 * the equivalent pattern for repositories).
 */
vi.mock('@/config/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

const mockedSignIn = vi.mocked(supabase.auth.signInWithPassword);

describe('App smoke test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByRole('heading', { name: /sign in to your workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from a protected route to /login', () => {
    renderAt('/reports');
    expect(screen.getByRole('heading', { name: /sign in to your workspace/i })).toBeInTheDocument();
  });

  it('shows the public homepage (not the login page) for an unauthenticated visitor at "/"', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /accounting that speaks/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in to your workspace/i })).not.toBeInTheDocument();
  });

  it('the homepage\'s Sign In control is a real link to /login', () => {
    renderAt('/');
    const signInButtons = screen.getAllByRole('button', { name: /^sign in$/i });
    expect(signInButtons.length).toBeGreaterThan(0);
    expect(signInButtons[0]).toHaveAttribute('href', '/login');
  });

  it('submitting the login form with empty fields shows validation errors and never calls Supabase', async () => {
    renderAt('/login');
    screen.getByRole('button', { name: /^sign in$/i }).click();

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('renders the signup page with the real Supabase sign-up form', () => {
    renderAt('/signup');
    expect(screen.getByRole('heading', { name: /create your workspace/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders the forgot-password page', () => {
    renderAt('/forgot-password');
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders the reset-password page', () => {
    renderAt('/reset-password');
    expect(screen.getByRole('heading', { name: /set a new password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set new password/i })).toBeInTheDocument();
  });
});
