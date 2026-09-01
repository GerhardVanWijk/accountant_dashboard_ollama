import { describe, it, expect } from 'vitest';
import { buildErrorReportCSV } from './errorReport';

describe('buildErrorReportCSV', () => {
  it('builds a CSV with row number and message columns', () => {
    const csv = buildErrorReportCSV([
      { rowNumber: 3, outcome: 'error', message: 'SKU is required.' },
      { rowNumber: 7, outcome: 'error', message: 'Duplicate SKU "PEN-1".' },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Row,Message');
    expect(lines[1]).toBe('3,SKU is required.');
    expect(lines[2]).toBe('7,"Duplicate SKU ""PEN-1""."');
  });

  it('handles a missing message', () => {
    const csv = buildErrorReportCSV([{ rowNumber: 5, outcome: 'error' }]);
    expect(csv.split('\r\n')[1]).toBe('5,');
  });

  it('returns just the header for no rows', () => {
    expect(buildErrorReportCSV([])).toBe('Row,Message');
  });
});
