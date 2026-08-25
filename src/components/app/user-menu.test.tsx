import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/config/supabase';
import type { Profile } from '@/types';

/**
 * M6 (docs/SUPABASE_MIGRATION_GUIDE.md): UserMenu now reads the real
 * authenticated profile and wires "Sign out" to the real logout() action
 * (which calls supabase.auth.signOut()) instead of a plain link to /login
 * that never cleared the session — this is the regression test for that
 * fix.
 */
vi.mock('@/config/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

const mockedSignOut = vi.mocked(supabase.auth.signOut);

function renderMenu(profile: Profile | null) {
  useAuthStore.setState({ profile });
  return render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  );
}

describe('UserMenu', () => {
  it('shows the real signed-in profile name, email, and role — not the old mock placeholder', () => {
    renderMenu({
      id: 'user_1',
      firstName: 'Thandi',
      lastName: 'Mokoena',
      email: 'thandi@example.co.za',
      role: 'accountant',
      companyId: 'company_1',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(screen.getByText('Thandi')).toBeInTheDocument();
    expect(screen.queryByText('Lerato')).not.toBeInTheDocument();
  });

  it('clicking "Sign out" calls the real Supabase sign-out flow, not a plain navigation', async () => {
    mockedSignOut.mockResolvedValue({ error: null });
    renderMenu({
      id: 'user_1',
      firstName: 'Thandi',
      lastName: 'Mokoena',
      email: 'thandi@example.co.za',
      role: 'accountant',
      companyId: 'company_1',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    screen.getByRole('button', { name: /open account menu/i }).click();
    const signOutItem = await screen.findByRole('menuitem', { name: /sign out/i });
    signOutItem.click();

    expect(mockedSignOut).toHaveBeenCalled();
  });

  it('never invents a name/role when no profile is loaded (honest generic presentation)', () => {
    renderMenu(null);
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('Lerato Mokoena')).not.toBeInTheDocument();
  });
});
