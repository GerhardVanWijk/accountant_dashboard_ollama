import type { DebitCredit } from '@/types';
import type { ParsedStatementLine, StatementFileFormat } from '../types';

/**
 * Real file parsing for the four statement formats banks in South Africa
 * commonly export (docs/HIVE_TASKS.md's Banking entry): CSV, OFX/QFX, QIF,
 * and SWIFT MT940. No fake "Import" button — every branch below actually
 * reads the file's own syntax.
 *
 * Internal convention (matches BankTransaction.direction,
 * src/types/bankTransaction.ts): 'debit' = money IN (increases the bank
 * asset account's debit-normal balance), 'credit' = money OUT. This is
 * DELIBERATELY OPPOSITE of how a bank statement's own "Debit"/"Credit"
 * columns are usually labelled (a bank statement's "Debit" column means
 * money debited FROM your account, i.e. money OUT) — each parser below
 * converts explicitly rather than assuming the labels line up.
 */

function normalizeDate(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) throw new Error('Statement line is missing a date.');

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = new Date(value);
    if (!isNaN(iso.getTime())) return iso.toISOString();
  }

  const parts = value.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3) {
    // SA banks conventionally export DD/MM/YYYY.
    const [d, m] = parts;
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
  }

  const fallback = new Date(value);
  if (isNaN(fallback.getTime())) {
    throw new Error(`Unrecognized date format: "${raw}"`);
  }
  return fallback.toISOString();
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

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

function parseAmount(raw: string | undefined): number {
  const cleaned = (raw ?? '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  const value = parseFloat(cleaned.replace(',', '.'));
  return Number.isNaN(value) ? 0 : value;
}

/**
 * CSV export with either a single signed Amount column (positive = money
 * in) or separate Debit/Credit columns (bank-statement convention: Debit =
 * money OUT). Column names are matched case-insensitively by substring so
 * "Transaction Date", "Value Date", "Debit Amount" etc. all resolve.
 */
export function parseCSVStatement(content: string): ParsedStatementLine[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV statement must have a header row and at least one transaction row.');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const descIdx = header.findIndex((h) => h.includes('description') || h.includes('narrative') || h.includes('memo'));
  const refIdx = header.findIndex((h) => h.includes('reference') || h === 'ref');
  const amountIdx = header.findIndex((h) => h === 'amount' || h.includes('amount'));
  const debitIdx = header.findIndex((h) => h.includes('debit'));
  const creditIdx = header.findIndex((h) => h.includes('credit'));

  if (dateIdx === -1 || descIdx === -1) {
    throw new Error('CSV statement must include Date and Description columns.');
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error('CSV statement must include an Amount column or Debit/Credit columns.');
  }

  const results: ParsedStatementLine[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.every((c) => c.trim() === '')) continue;

    const date = normalizeDate(cols[dateIdx]);
    const description = (cols[descIdx] ?? '').trim() || 'Statement transaction';
    const reference = refIdx !== -1 ? cols[refIdx]?.trim() || undefined : undefined;

    let amount: number;
    let direction: DebitCredit;
    if (amountIdx !== -1) {
      const raw = parseAmount(cols[amountIdx]);
      amount = Math.abs(raw);
      direction = raw >= 0 ? 'debit' : 'credit';
    } else {
      const debitVal = debitIdx !== -1 ? parseAmount(cols[debitIdx]) : 0;
      const creditVal = creditIdx !== -1 ? parseAmount(cols[creditIdx]) : 0;
      if (debitVal > 0) {
        amount = debitVal;
        direction = 'credit'; // statement "Debit" column = money out
      } else {
        amount = creditVal;
        direction = 'debit'; // statement "Credit" column = money in
      }
    }

    if (amount === 0) continue;

    results.push({
      sourceRowId: `csv_${i}_${date}_${amount.toFixed(2)}`,
      date,
      description,
      reference,
      amount,
      direction,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// OFX / QFX
// ---------------------------------------------------------------------------

function extractOfxTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, 'i'));
  return match ? match[1].trim() : undefined;
}

function ofxDateToISO(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').padEnd(8, '0');
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.slice(8, 10) || '00';
  const min = digits.slice(10, 12) || '00';
  const sec = digits.slice(12, 14) || '00';
  const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
  if (isNaN(date.getTime())) {
    throw new Error(`Unrecognized OFX DTPOSTED value: "${raw}"`);
  }
  return date.toISOString();
}

/**
 * OFX/QFX: SGML-ish or XML `<STMTTRN>` blocks. TRNAMT's own sign already
 * matches this codebase's direction convention (positive = money in), so no
 * inversion is needed here (unlike CSV's Debit/Credit columns).
 */
export function parseOFXStatement(content: string): ParsedStatementLine[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (blocks.length === 0) {
    throw new Error('No <STMTTRN> transaction blocks found in OFX file.');
  }

  return blocks.map((block, i) => {
    const dtposted = extractOfxTag(block, 'DTPOSTED');
    const trnamt = extractOfxTag(block, 'TRNAMT');
    const name = extractOfxTag(block, 'NAME') ?? extractOfxTag(block, 'MEMO') ?? 'OFX transaction';
    const fitid = extractOfxTag(block, 'FITID');

    if (!dtposted || trnamt === undefined) {
      throw new Error(`OFX transaction ${i + 1} is missing <DTPOSTED> or <TRNAMT>.`);
    }

    const date = ofxDateToISO(dtposted);
    const amount = parseFloat(trnamt);
    if (Number.isNaN(amount)) {
      throw new Error(`OFX transaction ${i + 1} has an unparseable <TRNAMT>: "${trnamt}".`);
    }

    return {
      sourceRowId: fitid ?? `ofx_${i}_${date}_${Math.abs(amount).toFixed(2)}`,
      date,
      description: name,
      reference: fitid,
      amount: Math.abs(amount),
      direction: amount >= 0 ? 'debit' : 'credit',
    };
  });
}

// ---------------------------------------------------------------------------
// QIF
// ---------------------------------------------------------------------------

/**
 * QIF: records separated by a line containing only `^`, fields prefixed by
 * a one-letter code (D=date, T/U=amount, P=payee, M=memo, N=reference).
 * The T amount's own sign matches this codebase's convention directly
 * (positive = deposit/money in).
 */
export function parseQIFStatement(content: string): ParsedStatementLine[] {
  const records = content
    .split(/^\^\s*$/m)
    .map((r) => r.trim())
    .filter(Boolean);

  if (records.length === 0) {
    throw new Error('No transaction records found in QIF file (expected lines separated by "^").');
  }

  return records.map((record, i) => {
    const lines = record
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let date: string | undefined;
    let amount: number | undefined;
    let payee = '';
    let memo = '';
    let reference: string | undefined;

    for (const line of lines) {
      const code = line[0];
      const value = line.slice(1).trim();
      switch (code) {
        case 'D':
          date = normalizeDate(value);
          break;
        case 'T':
        case 'U':
          amount = parseFloat(value.replace(/,/g, ''));
          break;
        case 'P':
          payee = value;
          break;
        case 'M':
          memo = value;
          break;
        case 'N':
          reference = value;
          break;
        default:
          break;
      }
    }

    if (date === undefined || amount === undefined || Number.isNaN(amount)) {
      throw new Error(`QIF record ${i + 1} is missing a date (D) or amount (T/U) line.`);
    }

    return {
      sourceRowId: `qif_${i}_${date}_${Math.abs(amount).toFixed(2)}`,
      date,
      description: payee || memo || 'QIF transaction',
      reference,
      amount: Math.abs(amount),
      direction: amount >= 0 ? 'debit' : 'credit',
    };
  });
}

// ---------------------------------------------------------------------------
// MT940
// ---------------------------------------------------------------------------

/**
 * SWIFT MT940: `:61:` statement lines carry date/mark/amount, an optional
 * following `:86:` line carries the narrative. `:61:` format:
 * YYMMDD[MMDD]D|C amount,decimals [type][ref]. As with a plain-text bank
 * statement, MT940's D/C mark is from the bank's perspective — D = money
 * OUT, C = money IN — so it inverts relative to this codebase's convention.
 */
export function parseMT940Statement(content: string): ParsedStatementLine[] {
  const lines = content.split(/\r?\n/);
  const results: ParsedStatementLine[] = [];
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(':61:')) continue;

    const body = line.slice(4);
    const match = body.match(/^(\d{6})(\d{4})?([CD])(\d+,\d{0,2})([A-Z][A-Z0-9]{0,3})?(.*)$/);
    if (!match) continue;

    const [, valueDate, , mark, amountStr, , tail] = match;
    const year = 2000 + parseInt(valueDate.slice(0, 2), 10);
    const month = parseInt(valueDate.slice(2, 4), 10);
    const day = parseInt(valueDate.slice(4, 6), 10);
    const date = new Date(Date.UTC(year, month - 1, day)).toISOString();
    const amount = parseFloat(amountStr.replace(',', '.'));
    const direction: DebitCredit = mark === 'C' ? 'debit' : 'credit';
    const reference = tail?.replace(/^\/\//, '').trim() || undefined;

    let description = 'MT940 transaction';
    if (lines[i + 1]?.startsWith(':86:')) {
      description = lines[i + 1].slice(4).trim() || description;
      i++;
    }

    results.push({
      sourceRowId: `mt940_${index}_${date}_${amount.toFixed(2)}`,
      date,
      description,
      reference,
      amount,
      direction,
    });
    index++;
  }

  if (results.length === 0) {
    throw new Error('No ":61:" statement lines found in MT940 file.');
  }
  return results;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function parseStatementFile(format: StatementFileFormat, content: string): ParsedStatementLine[] {
  switch (format) {
    case 'csv':
      return parseCSVStatement(content);
    case 'ofx':
      return parseOFXStatement(content);
    case 'qif':
      return parseQIFStatement(content);
    case 'mt940':
      return parseMT940Statement(content);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported statement format: ${String(exhaustive)}`);
    }
  }
}

export function detectStatementFormat(fileName: string): StatementFileFormat | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'csv';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  if (ext === 'qif') return 'qif';
  if (ext === 'sta' || ext === 'mt940' || ext === '940') return 'mt940';
  return undefined;
}
