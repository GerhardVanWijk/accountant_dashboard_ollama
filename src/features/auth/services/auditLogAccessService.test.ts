import { describe, expect, it, vi } from 'vitest';
import { AuditLogAccessService } from './auditLogAccessService';
import type {
  IAuditLogAccessRepository,
  LogAccessEventInput,
} from '@/repositories/auth/IAuditLogAccessRepository';

function fakeRepo(overrides: Partial<IAuditLogAccessRepository> = {}): IAuditLogAccessRepository {
  return {
    getByCompany: vi.fn().mockResolvedValue([]),
    getByUser: vi.fn().mockResolvedValue([]),
    log: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AuditLogAccessService', () => {
  it('logDenied records a permission-denied checkpoint', async () => {
    const repo = fakeRepo();
    new AuditLogAccessService(repo).logDenied('User management', { feature: 'user_management' });
    await flush();
    expect(repo.logEvent).toHaveBeenCalledWith(
      expect.objectContaining<Partial<LogAccessEventInput>>({
        action: 'access_denied',
        area: 'User management',
        result: 'denied_permission',
        detail: { feature: 'user_management' },
      }),
    );
  });

  it('logSensitiveView records an allowed view with a 24h dedupe window', async () => {
    const repo = fakeRepo();
    new AuditLogAccessService(repo).logSensitiveView('Payroll');
    await flush();
    expect(repo.logEvent).toHaveBeenCalledWith(
      expect.objectContaining<Partial<LogAccessEventInput>>({
        action: 'view',
        area: 'Payroll',
        result: 'allowed',
        dedupeWindowMinutes: 1440,
      }),
    );
  });

  it('never throws when the repository rejects — logging is fire-and-forget', async () => {
    const repo = fakeRepo({ logEvent: vi.fn().mockRejectedValue(new Error('offline')) });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => new AuditLogAccessService(repo).logSensitiveView('Audit trail')).not.toThrow();
    await flush();
    spy.mockRestore();
  });

  it('never throws when the repository throws synchronously', () => {
    const repo = fakeRepo({
      logEvent: vi.fn(() => {
        throw new Error('sync boom');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => new AuditLogAccessService(repo).logEvent({ action: 'view', area: 'X', result: 'allowed' })).not.toThrow();
    spy.mockRestore();
  });
});
