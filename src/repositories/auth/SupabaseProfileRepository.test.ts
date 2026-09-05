import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProfileRepository } from './SupabaseProfileRepository';

describe('SupabaseProfileRepository.addExistingUserToCompany', () => {
  it('calls the add_existing_user_to_company RPC with the target user and company', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: 'ASSIGNED' }, error: null });
    const repo = new SupabaseProfileRepository({ rpc } as unknown as SupabaseClient);

    await repo.addExistingUserToCompany('user-1', 'company-1');

    expect(rpc).toHaveBeenCalledWith('add_existing_user_to_company', { p_user_id: 'user-1', p_company_id: 'company-1' });
  });

  it('rethrows the RAW DB error message (it is written to be shown to the user)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'That person is already a member of a company and cannot be added to another.' },
    });
    const repo = new SupabaseProfileRepository({ rpc } as unknown as SupabaseClient);

    await expect(repo.addExistingUserToCompany('user-1', 'company-1')).rejects.toThrow(
      'That person is already a member of a company and cannot be added to another.',
    );
  });

  it('resolves (no throw) when the RPC succeeds — including the idempotent already-in-company case', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: 'ALREADY_IN_COMPANY' }, error: null });
    const repo = new SupabaseProfileRepository({ rpc } as unknown as SupabaseClient);

    await expect(repo.addExistingUserToCompany('user-1', 'company-1')).resolves.toBeUndefined();
  });

  it('no longer exposes the broken plain-UPDATE updateCompany primitive', () => {
    const repo = new SupabaseProfileRepository({} as unknown as SupabaseClient);
    expect((repo as unknown as Record<string, unknown>).updateCompany).toBeUndefined();
  });
});
