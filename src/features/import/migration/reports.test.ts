import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadExceptionReport, downloadResultReport } from './reports';

/** Spies on the URL/anchor download mechanics `csvExport.ts`'s `downloadCSV` uses, without re-testing CSV escaping itself (already covered by csvExport.test.ts). */
function spyOnDownload() {
  const clicks: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  });
  return {
    clicks,
    restore: () => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      anchorClick.mockRestore();
    },
  };
}

describe('downloadExceptionReport / downloadResultReport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('triggers a CSV download named after the batch/prefix', () => {
    const spy = spyOnDownload();
    downloadExceptionReport('my-batch', [
      { id: 'i1', companyId: 'c1', batchId: 'b1', severity: 'error', issueCode: 'X', category: 'STRUCTURE', message: 'Bad row', resolutionStatus: 'open', resolutionMetadata: {}, createdAt: '', batchFileName: 'file.csv' },
    ]);
    expect(spy.clicks[0]).toMatch(/^my-batch-exceptions-.*\.csv$/);
    spy.restore();
  });

  it('triggers a CSV download for the full result report, including non-error outcomes', () => {
    const spy = spyOnDownload();
    downloadResultReport('customers.csv', 'Customers', [
      { rowNumber: 2, outcome: 'imported' },
      { rowNumber: 3, outcome: 'skipped', message: 'Already exists.' },
      { rowNumber: 4, outcome: 'error', message: 'Invalid.' },
    ]);
    expect(spy.clicks[0]).toMatch(/^customers-import-result-.*\.csv$/);
    spy.restore();
  });

  it('includes a "Created / Mapped Record" column using the adapter-supplied business identifier, blank when none was set', () => {
    let capturedContent = '';
    const OriginalBlob = global.Blob;
    // jsdom's Blob doesn't implement .text() in this environment — capture the constructor's own input instead.
    class CapturingBlob extends OriginalBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedContent = (parts as string[]).join('');
      }
    }
    global.Blob = CapturingBlob as unknown as typeof Blob;
    const spy = spyOnDownload();

    downloadResultReport('trial-balance.csv', 'Trial Balance', [
      { rowNumber: 2, outcome: 'imported', recordRef: '1000' },
      { rowNumber: 3, outcome: 'error', message: 'Invalid.' },
    ]);

    expect(capturedContent).toContain('Created / Mapped Record');
    const lines = capturedContent.replace(new RegExp('^\\uFEFF'), '').split('\r\n');
    expect(lines[1]).toBe('2,Trial Balance,imported,1000,');
    expect(lines[2]).toBe('3,Trial Balance,error,,Invalid.');

    global.Blob = OriginalBlob;
    spy.restore();
  });
});
