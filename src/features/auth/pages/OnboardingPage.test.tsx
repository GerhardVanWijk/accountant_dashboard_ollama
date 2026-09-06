import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingPage } from './OnboardingPage';
import { supabase } from '@/config/supabase';
import { profileService } from '../services';
import { useAuthStore } from '@/stores/authStore';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('@/config/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock('../services', () => ({
  profileService: { getById: vi.fn() },
}));

const mockedRpc = vi.mocked(supabase.rpc);
const mockedGetById = vi.mocked(profileService.getById);

/**
 * BLOCK 1 (2026-09-06) — the company-creation form now drives the atomic,
 * seeded `create_company_and_become_admin` RPC (migration 0066). These
 * tests pin the RPC call shape (all 11 params, optionals nulled when
 * blank), honest error handling, double-submit prevention, and the
 * refresh-then-navigate success path.
 */
describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      profile: { id: 'user_1', email: 'new@example.co.za', role: 'viewer', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      setProfile: useAuthStore.getState().setProfile,
    });
  });

  function fillName(value = 'Kalahari Trading (Pty) Ltd') {
    fireEvent.change(screen.getByLabelText(/registered company name/i), { target: { value } });
  }

  it('creates the company through the atomic SECURITY DEFINER RPC with the full parameter set', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as never);
    mockedGetById.mockResolvedValue(undefined);

    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName('Kalahari Trading (Pty) Ltd');
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockedRpc).toHaveBeenCalledWith('create_company_and_become_admin', {
        p_name: 'Kalahari Trading (Pty) Ltd',
        p_legal_entity_type: 'private_company',
        p_financial_year_end_month: 2,
        p_financial_year_end_day: 28,
        p_functional_currency: 'ZAR',
        p_registration_number: null,
        p_trading_name: null,
        p_is_vat_registered: false,
        p_vat_registration_number: null,
        p_contact_email: 'new@example.co.za',
        p_contact_phone: null,
      }),
    );
  });

  it('passes registration + VAT details through when supplied', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as never);
    mockedGetById.mockResolvedValue(undefined);

    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName('Vaal Metals CC');
    fireEvent.change(screen.getByLabelText(/company registration number/i), { target: { value: '2019/555444/23' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /registered for vat/i }));
    fireEvent.change(await screen.findByLabelText(/vat registration number/i), { target: { value: '4123456789' } });
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockedRpc).toHaveBeenCalledWith(
        'create_company_and_become_admin',
        expect.objectContaining({
          p_name: 'Vaal Metals CC',
          p_registration_number: '2019/555444/23',
          p_is_vat_registered: true,
          p_vat_registration_number: '4123456789',
        }),
      ),
    );
  });

  it('requires a VAT number once "registered for VAT" is ticked', async () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName();
    fireEvent.click(screen.getByRole('checkbox', { name: /registered for vat/i }));
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    expect(await screen.findByText(/enter your vat registration number/i)).toBeInTheDocument();
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('surfaces a server error honestly and does not navigate away', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'You already belong to a company.' } } as never);

    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    expect(await screen.findByText('You already belong to a company.')).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('refreshes the profile and navigates to the dashboard on success', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as never);
    mockedGetById.mockResolvedValue({ id: 'user_1', email: 'new@example.co.za', role: 'admin', companyId: 'co_1', isActive: true, createdAt: '', updatedAt: '' });

    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(mockedGetById).toHaveBeenCalledWith('user_1'));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('does not fire the RPC twice on a rapid double click', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    mockedRpc.mockReturnValue(new Promise((r) => { resolveRpc = r; }) as never);
    mockedGetById.mockResolvedValue(undefined);

    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fillName();
    const button = screen.getByRole('button', { name: /create company/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    resolveRpc({ data: null, error: null });
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });
});
