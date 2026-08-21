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

  it('exposes no update or delete method — audit logs are append-only', () => {
    const repository = new MockAuditLogRepository();
    expect((repository as unknown as { update?: unknown }).update).toBeUndefined();
    expect((repository as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
