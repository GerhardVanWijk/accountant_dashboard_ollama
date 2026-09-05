import { describe, expect, it, vi } from 'vitest';
import { ProfileService } from './profileService';
import type { IProfileRepository } from '@/repositories/auth/IProfileRepository';
import type { AuditLogService } from '@/services/auditLogService';

function makeRepo(overrides: Partial<IProfileRepository> = {}): IProfileRepository {
  return {
    getById: vi.fn(),
    getByCompany: vi.fn(),
    getAll: vi.fn(),
    updateRole: vi.fn(),
    setActive: vi.fn(),
    updateOwnProfile: vi.fn(),
    findUnassignedByEmail: vi.fn(),
    addExistingUserToCompany: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const noopAudit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;

describe('ProfileService.addExistingUserToCompany', () => {
  it('delegates to the RPC-backed repository method with (targetUserId, companyId) — the actor arg is NOT forwarded', async () => {
    const repo = makeRepo();
    const service = new ProfileService(repo, noopAudit);

    await service.addExistingUserToCompany('actor-admin', 'target-user', 'company-1');

    expect(repo.addExistingUserToCompany).toHaveBeenCalledWith('target-user', 'company-1');
    expect(repo.addExistingUserToCompany).toHaveBeenCalledTimes(1);
  });

  it('does NOT write a separate client-side audit entry (the RPC audits in-transaction)', async () => {
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    const service = new ProfileService(makeRepo(), audit);

    await service.addExistingUserToCompany('actor-admin', 'target-user', 'company-1');

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('propagates a controlled RPC error to the caller (no swallowing, no silent success)', async () => {
    const repo = makeRepo({
      addExistingUserToCompany: vi.fn().mockRejectedValue(new Error('That person is already a member of a company and cannot be added to another.')),
    });
    const service = new ProfileService(repo, noopAudit);

    await expect(service.addExistingUserToCompany('actor-admin', 'target-user', 'company-1')).rejects.toThrow(
      /already a member of a company/,
    );
  });
});
