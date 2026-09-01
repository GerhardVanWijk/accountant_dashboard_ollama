import type { ImportCellValue, ParsedSheet } from '../types';

/** Same quoted-field CSV line parser as `banking/utils/statementParsers.ts`'s `parseCsvLine` — kept as an independent copy rather than a shared import since that module is banking-specific and not a dependency this framework should take on. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parses raw CSV text into a single `ParsedSheet`. Every cell stays a
 * `string` (or `undefined` for a genuinely missing trailing column) —
 * numeric/date/boolean coercion is the ADAPTER's job (via its
 * `ImportFieldDef.type`), not the parser's, since a CSV cell carries no
 * type information the way a spreadsheet cell does. Blank rows (every
 * cell empty) are dropped; a row shorter than the header is padded with
 * `undefined` rather than dropped, so a genuinely sparse row still
 * reaches validation (where a missing required field becomes a proper
 * error, not a silent skip).
 */
export function parseCSV(content: string): ParsedSheet {
  const rawLines = content.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(nonEmpty[0]).map((h) => h.trim());
  const rows: ImportCellValue[][] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = parseCsvLine(nonEmpty[i]);
    if (cols.every((c) => c.trim() === '')) continue;
    const row: ImportCellValue[] = [];
    for (let c = 0; c < headers.length; c++) {
      const value = cols[c];
      row.push(value === undefined || value === '' ? undefined : value);
    }
    rows.push(row);
  }
  return { headers, rows };
}
