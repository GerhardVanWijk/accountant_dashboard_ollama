import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveMappingProfile } from './importMappingProfileService';
import { supabase } from '@/config/supabase';

/** Per-file override of the global `@/config/supabase` mock (tests/setup.ts) — see docs/TESTING_SUPABASE.md. */
vi.mock('@/config/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

const PROFILE_ROW = {
  id: 'profile_1',
  company_id: 'company_1',
  name: 'ABC Client — Pastel Chart of Accounts',
  source_system: 'pastel_sage',
  import_type: 'trial_balance',
  column_mappings: { code: 'Account No' },
  format_settings: {},
  account_mappings: { '1000': { action: 'existing', accountId: 'acc_1' } },
  tax_mappings: { STD: { action: 'mapped', taxRateId: 'rate_std' } },
  is_system: false,
  is_active: true,
  created_by: 'user_1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('saveMappingProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: { id: 'user_1' } } });
  });

  function mockInsert(row: typeof PROFILE_ROW | null, error: { message: string } | null = null) {
    const single = vi.fn().mockResolvedValue({ data: row, error });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert });
    return insert;
  }

  it('resolves the active company via get_my_company_id and includes it on the insert — a save with no company_id violates the profiles table\'s own is_system/company_id pairing constraint', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'company_1', error: null });
    const insert = mockInsert(PROFILE_ROW);

    await saveMappingProfile({ name: PROFILE_ROW.name, sourceSystem: 'pastel_sage', importType: 'trial_balance', columnMappings: { code: 'Account No' } });

    expect(supabase.rpc).toHaveBeenCalledWith('get_my_company_id');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: 'company_1', is_system: false }));
  });

  it('persists account mappings and tax mappings alongside column mappings — the completed profile, not column mapping only', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'company_1', error: null });
    const insert = mockInsert(PROFILE_ROW);

    const result = await saveMappingProfile({
      name: PROFILE_ROW.name,
      sourceSystem: 'pastel_sage',
      importType: 'trial_balance',
      columnMappings: { code: 'Account No' },
      accountMappings: { '1000': { action: 'existing', accountId: 'acc_1' } },
      taxMappings: { STD: { action: 'mapped', taxRateId: 'rate_std' } },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_mappings: { '1000': { action: 'existing', accountId: 'acc_1' } },
        tax_mappings: { STD: { action: 'mapped', taxRateId: 'rate_std' } },
      }),
    );
    expect(result.accountMappings).toEqual({ '1000': { action: 'existing', accountId: 'acc_1' } });
    expect(result.taxMappings).toEqual({ STD: { action: 'mapped', taxRateId: 'rate_std' } });
  });

  it('fails closed when the active company cannot be resolved, without attempting the insert', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    const insert = mockInsert(PROFILE_ROW);

    await expect(
      saveMappingProfile({ name: 'x', sourceSystem: 'generic', importType: 'trial_balance', columnMappings: {} }),
    ).rejects.toThrow('Could not resolve the active company.');
    expect(insert).not.toHaveBeenCalled();
  });
});
