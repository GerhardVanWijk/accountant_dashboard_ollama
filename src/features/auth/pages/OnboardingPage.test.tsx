import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingPage } from './OnboardingPage';
import { supabase } from '@/config/supabase';
import { profileService } from '../services';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/config/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock('../services', () => ({
  profileService: { getById: vi.fn() },
}));

const mockedRpc = vi.mocked(supabase.rpc);
const mockedGetById = vi.mocked(profileService.getById);

/**
 * M10 re-skinned this page's JSX only — same
 * `create_company_and_become_admin` RPC, same fields, same redirect. This
 * test guards that the provisioning call itself is byte-for-byte unchanged
 * by the visual pass.
 */
describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { id: 'user_1', email: 'new@example.co.za', role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } });
  });

  it('creates the company through the real SECURITY DEFINER RPC, not a plain table write', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as never);
    mockedGetById.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockedRpc).toHaveBeenCalledWith('create_company_and_become_admin', {
        p_name: 'Acme Co',
        p_legal_entity_type: 'private_company',
        p_financial_year_end_month: 12,
        p_financial_year_end_day: 31,
        p_functional_currency: 'ZAR',
      }),
    );
  });

  it('surfaces a server error honestly rather than navigating away', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'boom' } } as never);

    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
