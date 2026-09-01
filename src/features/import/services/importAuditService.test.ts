import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordImportAudit } from './importAuditService';
import { auditLogService } from '@/services/auditLogService';

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { log: vi.fn() },
}));

const mockedLog = auditLogService.log as unknown as ReturnType<typeof vi.fn>;

describe('recordImportAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs a data_imported summary row with counts, never the parsed rows', async () => {
    await recordImportAudit({
      adapterId: 'inventory-products',
      adapterLabel: 'Products',
      fileName: 'products.csv',
      actorUserId: 'user_1',
      summary: { rowsRead: 10, imported: 7, updated: 1, skipped: 1, errored: 1, rows: [{ rowNumber: 1, outcome: 'imported' }] },
    });
    expect(mockedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        action: 'data_imported',
        module: 'import',
        recordType: 'ImportBatch',
        newValue: expect.objectContaining({ fileName: 'products.csv', rowsRead: 10, imported: 7, updated: 1, skipped: 1, errored: 1 }),
      }),
    );
    const call = mockedLog.mock.calls[0][0];
    expect(call.newValue).not.toHaveProperty('rows');
  });
});
