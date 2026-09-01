import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseImportFile, ImportFileError, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from './fileParser';

/** jsdom's `File` in this environment doesn't implement `.text()`/`.arrayBuffer()` — same fake-object pattern `banking/hooks/useStatementImport.test.ts` uses for its own file-reading tests. */
function fakeCsvFile(name: string, content: string, size = content.length): File {
  return { name, type: 'text/csv', size, text: async () => content } as unknown as File;
}

function fakeXlsxFile(name: string, rows: unknown[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    name,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.byteLength,
    arrayBuffer: async () => buffer,
  } as unknown as File;
}

describe('parseImportFile', () => {
  it('parses a .csv file', async () => {
    const workbook = await parseImportFile(fakeCsvFile('products.csv', 'SKU,Name\nA,Widget'));
    expect(workbook.format).toBe('csv');
    expect(workbook.worksheetNames).toEqual(['Sheet1']);
    expect(workbook.getSheet('Sheet1').rows).toEqual([['A', 'Widget']]);
  });

  it('parses a .xlsx file', async () => {
    const workbook = await parseImportFile(fakeXlsxFile('products.xlsx', [['SKU', 'Name'], ['A', 'Widget']]));
    expect(workbook.format).toBe('xlsx');
    expect(workbook.getSheet('Sheet1').rows).toEqual([['A', 'Widget']]);
  });

  it('rejects an unsupported extension', async () => {
    await expect(parseImportFile(fakeCsvFile('products.pdf', 'irrelevant'))).rejects.toThrow(ImportFileError);
  });

  it('rejects an empty file', async () => {
    await expect(parseImportFile(fakeCsvFile('empty.csv', '', 0))).rejects.toThrow(/empty/i);
  });

  it('rejects a file over the size limit', async () => {
    await expect(parseImportFile(fakeCsvFile('big.csv', 'SKU\nA', MAX_IMPORT_FILE_BYTES + 1))).rejects.toThrow(/limit/i);
  });

  it('rejects a CSV with more rows than the row limit', async () => {
    const header = 'SKU,Name\n';
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `SKU-${i},Name ${i}`).join('\n');
    await expect(parseImportFile(fakeCsvFile('huge.csv', header + rows))).rejects.toThrow(/limit/i);
  });
});
