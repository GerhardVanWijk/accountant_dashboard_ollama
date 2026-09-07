import { describe, it, expect } from 'vitest';
import { MockAuditLogRepository } from './MockAuditLogRepository';
import type { AuditLogEntry } from '@/types';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '',
    userId: 'user_1',
    action: 'posted',
    module: 'accounting',
    recordType: 'JournalEntry',
    recordId: 'je_1',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('MockAuditLogRepository', () => {
  it('starts empty by default', async () => {
    const repository = new MockAuditLogRepository();
    expect(await repository.getAll()).toEqual([]);
  });

  it('appends entries and assigns an id/timestamps', async () => {
    const repository = new MockAuditLogRepository();
    const created = await repository.create(makeEntry());
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(await repository.getAll()).toHaveLength(1);
  });

  it('getByRecord filters to one record', async () => {
    const repository = new MockAuditLogRepository();
    await repository.create(makeEntry({ recordId: 'je_1' }));
    await repository.create(makeEntry({ recordId: 'je_2' }));
    await repository.create(makeEntry({ recordId: 'je_1', action: 'reversed' }));

    const logs = await repository.getByRecord('JournalEntry', 'je_1');
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.action)).toEqual(['posted', 'reversed']);
  });

  it('getPage filters, sorts newest-first and pages', async () => {
    const repository = new MockAuditLogRepository();
    await repository.create(makeEntry({ createdAt: '2026-08-01T00:00:00.000Z', module: 'admin', action: 'permission_changed' }));
    await repository.create(makeEntry({ createdAt: '2026-08-05T00:00:00.000Z', module: 'sales', action: 'posted' }));
    await repository.create(makeEntry({ createdAt: '2026-08-03T00:00:00.000Z', module: 'admin', action: 'created' }));

    const all = await repository.getPage({ page: 0, pageSize: 10 });
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.createdAt)).toEqual([
      '2026-08-05T00:00:00.000Z',
      '2026-08-03T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    ]);

    const admin = await repository.getPage({ page: 0, pageSize: 10, module: 'admin' });
    expect(admin.total).toBe(2);

    const byActions = await repository.getPage({ page: 0, pageSize: 10, actions: ['posted', 'created'] });
    expect(byActions.total).toBe(2);

    const firstPage = await repository.getPage({ page: 0, pageSize: 2 });
    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.total).toBe(3);
    const secondPage = await repository.getPage({ page: 1, pageSize: 2 });
    expect(secondPage.rows).toHaveLength(1);

    const windowed = await repository.getPage({ page: 0, pageSize: 10, from: '2026-08-02T00:00:00.000Z' });
    expect(windowed.total).toBe(2);
  });

  it('exposes no update or delete method — audit logs are append-only', () => {
    const repository = new MockAuditLogRepository();
    expect((repository as unknown as { update?: unknown }).update).toBeUndefined();
    expect((repository as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
