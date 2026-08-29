import type { DebitCredit } from '@/types';
import type { ParsedStatement, ParsedStatementLine, StatementFileFormat, StatementParseError } from '../types';

/**
 * Real file parsing for the four statement formats banks in South Africa
 * commonly export (docs/HIVE_TASKS.md's Banking entry): CSV, OFX/QFX, QIF,
 * and SWIFT MT940. No fake "Import" button — every branch below actually
 * reads the file's own syntax.
 *
 * Each parser returns a `ParsedStatement`: the lines that parsed, the
 * statement-level metadata the format carried (opening/closing balance,
 * period start/end), and a `parseErrors` list. A single malformed row is
 * recorded in `parseErrors` and parsing CONTINUES — only a fundamentally
 * unparseable file (wrong format, no recognisable rows at all, missing
 * required columns) throws. This replaces the old behaviour where any bad
 * row aborted the whole file (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md).
 *
 * Internal direction convention (matches BankTransaction.direction,
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

/** +inflow / −outflow, using this codebase's inverted-vs-bank direction convention. */
export function signedLineAmount(line: Pick<ParsedStatementLine, 'amount' | 'direction'>): number {
  return line.direction === 'debit' ? line.amount : -line.amount;
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
 * "Transaction Date", "Value Date", "Debit Amount" etc. all resolve. An
 * optional running-balance column is captured per line when present; CSV
 * exports rarely carry an explicit opening/closing figure so those stay
 * undefined.
 */
export function parseCSVStatement(content: string): ParsedStatement {
  const rawLines = content.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) {
    throw new Error('CSV statement must have a header row and at least one transaction row.');
  }

  const header = parseCsvLine(nonEmpty[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const descIdx = header.findIndex((h) => h.includes('description') || h.includes('narrative') || h.includes('memo'));
  const refIdx = header.findIndex((h) => h.includes('reference') || h === 'ref');
  const amountIdx = header.findIndex((h) => h === 'amount' || h.includes('amount'));
  const debitIdx = header.findIndex((h) => h.includes('debit'));
  const creditIdx = header.findIndex((h) => h.includes('credit'));
  const balanceIdx = header.findIndex((h) => h.includes('balance'));

  if (dateIdx === -1 || descIdx === -1) {
    throw new Error('CSV statement must include Date and Description columns.');
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error('CSV statement must include an Amount column or Debit/Credit columns.');
  }

  const lines: ParsedStatementLine[] = [];
  const parseErrors: StatementParseError[] = [];

  // Iterate the ORIGINAL rows so parseErrors carry a file-accurate rowIndex.
  let dataRowIndex = 0;
  for (let fileRow = 1; fileRow < rawLines.length; fileRow++) {
    const rowText = rawLines[fileRow];
    if (rowText.trim().length === 0) continue;
    const cols = parseCsvLine(rowText);
    if (cols.every((c) => c.trim() === '')) continue;
    dataRowIndex++;

    try {
      const date = normalizeDate(cols[dateIdx]);
      const description = (cols[descIdx] ?? '').trim() || 'Statement transaction';
      const reference = refIdx !== -1 ? cols[refIdx]?.trim() || undefined : undefined;

      let amount: number;
      let direction: DebitCredit;
      if (amountIdx !== -1) {
        const parsed = parseAmount(cols[amountIdx]);
        amount = Math.abs(parsed);
        direction = parsed >= 0 ? 'debit' : 'credit';
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

      if (amount === 0) {
        parseErrors.push({ rowIndex: dataRowIndex - 1, raw: rowText, reason: 'Row has a zero or unparseable amount.' });
        continue;
      }

      const raw: Record<string, unknown> = {};
      header.forEach((h, i) => {
        if (h) raw[h] = cols[i];
      });

      const runningBalance = balanceIdx !== -1 && cols[balanceIdx]?.trim() ? parseAmount(cols[balanceIdx]) : undefined;
      const sourceRowId = `csv_${dataRowIndex}_${date}_${amount.toFixed(2)}`;

      lines.push({
        sourceRowId,
        externalRefId: reference ?? sourceRowId,
        date,
        description,
        reference,
        amount,
        direction,
        runningBalance,
        raw,
      });
    } catch (err) {
      parseErrors.push({
        rowIndex: dataRowIndex - 1,
        raw: rowText,
        reason: err instanceof Error ? err.message : 'Unparseable CSV row.',
      });
    }
  }

  if (lines.length === 0 && parseErrors.length === 0) {
    throw new Error('CSV statement contained no transaction rows.');
  }

  return { lines, parseErrors, format: 'csv' };
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
    throw new Error(`Unrecognized OFX date value: "${raw}"`);
  }
  return date.toISOString();
}

/**
 * OFX/QFX: SGML-ish or XML `<STMTTRN>` blocks. TRNAMT's own sign already
 * matches this codebase's direction convention (positive = money in), so no
 * inversion is needed here (unlike CSV's Debit/Credit columns). Statement
 * metadata comes from `<BANKTRANLIST>`'s `<DTSTART>`/`<DTEND>` and the
 * `<LEDGERBAL><BALAMT>` closing figure; OFX carries no independent opening
 * balance so `openingBalance` stays undefined.
 */
export function parseOFXStatement(content: string): ParsedStatement {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (blocks.length === 0) {
    throw new Error('No <STMTTRN> transaction blocks found in OFX file.');
  }

  const lines: ParsedStatementLine[] = [];
  const parseErrors: StatementParseError[] = [];

  blocks.forEach((block, i) => {
    try {
      const dtposted = extractOfxTag(block, 'DTPOSTED');
      const trnamt = extractOfxTag(block, 'TRNAMT');
      const name = extractOfxTag(block, 'NAME') ?? extractOfxTag(block, 'MEMO') ?? 'OFX transaction';
      const fitid = extractOfxTag(block, 'FITID');
      const memo = extractOfxTag(block, 'MEMO');
      const trntype = extractOfxTag(block, 'TRNTYPE');
      const checknum = extractOfxTag(block, 'CHECKNUM');

      if (!dtposted || trnamt === undefined) {
        throw new Error(`OFX transaction ${i + 1} is missing <DTPOSTED> or <TRNAMT>.`);
      }

      const date = ofxDateToISO(dtposted);
      const amount = parseFloat(trnamt);
      if (Number.isNaN(amount)) {
        throw new Error(`OFX transaction ${i + 1} has an unparseable <TRNAMT>: "${trnamt}".`);
      }

      const sourceRowId = fitid ?? `ofx_${i}_${date}_${Math.abs(amount).toFixed(2)}`;
      lines.push({
        sourceRowId,
        externalRefId: fitid ?? sourceRowId,
        date,
        description: name,
        reference: fitid ?? checknum,
        amount: Math.abs(amount),
        direction: amount >= 0 ? 'debit' : 'credit',
        raw: { DTPOSTED: dtposted, TRNAMT: trnamt, NAME: name, MEMO: memo, FITID: fitid, TRNTYPE: trntype, CHECKNUM: checknum },
      });
    } catch (err) {
      parseErrors.push({
        rowIndex: i,
        raw: block.trim(),
        reason: err instanceof Error ? err.message : 'Unparseable OFX <STMTTRN> block.',
      });
    }
  });

  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let closingBalance: number | undefined;

  const dtStart = extractOfxTag(content, 'DTSTART');
  const dtEnd = extractOfxTag(content, 'DTEND');
  try {
    if (dtStart) periodStart = ofxDateToISO(dtStart);
    if (dtEnd) periodEnd = ofxDateToISO(dtEnd);
  } catch {
    /* period metadata is best-effort */
  }

  const ledgerBlock = content.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i)?.[0] ?? content;
  const balAmt = extractOfxTag(ledgerBlock, 'BALAMT');
  if (balAmt !== undefined && !Number.isNaN(parseFloat(balAmt))) {
    closingBalance = parseFloat(balAmt);
  }

  return { lines, parseErrors, format: 'ofx', periodStart, periodEnd, closingBalance };
}

// ---------------------------------------------------------------------------
// QIF
// ---------------------------------------------------------------------------

/**
 * QIF: records separated by a line containing only `^`, fields prefixed by
 * a one-letter code (D=date, T/U=amount, P=payee, M=memo, N=reference).
 * The T amount's own sign matches this codebase's convention directly
 * (positive = deposit/money in). QIF carries no statement-level balance or
 * period metadata.
 */
export function parseQIFStatement(content: string): ParsedStatement {
  const records = content
    .split(/^\^\s*$/m)
    .map((r) => r.trim())
    .filter(Boolean);

  if (records.length === 0) {
    throw new Error('No transaction records found in QIF file (expected lines separated by "^").');
  }

  const lines: ParsedStatementLine[] = [];
  const parseErrors: StatementParseError[] = [];

  records.forEach((record, i) => {
    try {
      const recordLines = record
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let date: string | undefined;
      let amount: number | undefined;
      let payee = '';
      let memo = '';
      let reference: string | undefined;
      const raw: Record<string, unknown> = {};

      for (const line of recordLines) {
        const code = line[0];
        const value = line.slice(1).trim();
        raw[code] = value;
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

      const sourceRowId = `qif_${i}_${date}_${Math.abs(amount).toFixed(2)}`;
      lines.push({
        sourceRowId,
        externalRefId: reference ?? sourceRowId,
        date,
        description: payee || memo || 'QIF transaction',
        reference,
        amount: Math.abs(amount),
        direction: amount >= 0 ? 'debit' : 'credit',
        raw,
      });
    } catch (err) {
      parseErrors.push({
        rowIndex: i,
        raw: record,
        reason: err instanceof Error ? err.message : 'Unparseable QIF record.',
      });
    }
  });

  if (lines.length === 0 && parseErrors.length === 0) {
    throw new Error('QIF file contained no transaction records.');
  }

  return { lines, parseErrors, format: 'qif' };
}

// ---------------------------------------------------------------------------
// MT940
// ---------------------------------------------------------------------------

/** `:60F:` / `:62F:` etc. balance field body: `C|D` `YYMMDD` `CCC` `amount,dd`. */
function parseMt940Balance(body: string): { amount: number; date: string } | undefined {
  const match = body.match(/^([CD])(\d{6})([A-Z]{3})([\d.,]+)$/);
  if (!match) return undefined;
  const [, mark, yymmdd, , amountStr] = match;
  const year = 2000 + parseInt(yymmdd.slice(0, 2), 10);
  const month = parseInt(yymmdd.slice(2, 4), 10);
  const day = parseInt(yymmdd.slice(4, 6), 10);
  const magnitude = parseFloat(amountStr.replace(/,(\d{2})$/, '.$1').replace(/,/g, ''));
  if (Number.isNaN(magnitude)) return undefined;
  // MT940 balance mark is from the account-holder's perspective: C = funds in
  // the account (positive), D = overdrawn (negative).
  return { amount: mark === 'C' ? magnitude : -magnitude, date: new Date(Date.UTC(year, month - 1, day)).toISOString() };
}

/**
 * SWIFT MT940: `:61:` statement lines carry date/mark/amount, an optional
 * following `:86:` line carries the narrative. `:61:` format:
 * YYMMDD[MMDD]D|C amount,decimals [type][ref]. As with a plain-text bank
 * statement, MT940's D/C mark is from the bank's perspective — D = money
 * OUT, C = money IN — so it inverts relative to this codebase's convention.
 * `:60F:`/`:60M:` give the opening balance + statement start, `:62F:`/`:62M:`
 * the closing balance + statement end.
 */
export function parseMT940Statement(content: string): ParsedStatement {
  const rawLines = content.split(/\r?\n/);
  const lines: ParsedStatementLine[] = [];
  const parseErrors: StatementParseError[] = [];

  let openingBalance: number | undefined;
  let closingBalance: number | undefined;
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let index = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    const openMatch = line.match(/^:60[FM]:(.+)$/);
    if (openMatch) {
      const bal = parseMt940Balance(openMatch[1].trim());
      if (bal) {
        openingBalance = bal.amount;
        periodStart = bal.date;
      }
      continue;
    }

    const closeMatch = line.match(/^:62[FM]:(.+)$/);
    if (closeMatch) {
      const bal = parseMt940Balance(closeMatch[1].trim());
      if (bal) {
        closingBalance = bal.amount;
        periodEnd = bal.date;
      }
      continue;
    }

    if (!line.startsWith(':61:')) continue;

    const body = line.slice(4);
    const match = body.match(/^(\d{6})(\d{4})?([CD])([RD]?)(\d+,\d{0,2})([A-Z][A-Z0-9]{0,3})?(.*)$/);
    if (!match) {
      parseErrors.push({ rowIndex: index, raw: line, reason: 'Malformed MT940 :61: statement line.' });
      index++;
      continue;
    }

    try {
      const [, valueDatePart, entryDatePart, mark, , amountStr, , tail] = match;
      const year = 2000 + parseInt(valueDatePart.slice(0, 2), 10);
      const vMonth = parseInt(valueDatePart.slice(2, 4), 10);
      const vDay = parseInt(valueDatePart.slice(4, 6), 10);
      const valueDate = new Date(Date.UTC(year, vMonth - 1, vDay)).toISOString();

      let date = valueDate;
      if (entryDatePart) {
        const eMonth = parseInt(entryDatePart.slice(0, 2), 10);
        const eDay = parseInt(entryDatePart.slice(2, 4), 10);
        const entry = new Date(Date.UTC(year, eMonth - 1, eDay));
        if (!Number.isNaN(entry.getTime())) date = entry.toISOString();
      }

      const amount = parseFloat(amountStr.replace(',', '.'));
      if (Number.isNaN(amount)) throw new Error(`Unparseable MT940 amount: "${amountStr}".`);
      const direction: DebitCredit = mark === 'C' ? 'debit' : 'credit';

      const [ownerRef, bankRef] = (tail ?? '').split('//');
      const reference = (ownerRef ?? '').replace(/^NONREF$/i, '').trim() || (bankRef ?? '').trim() || undefined;

      let description = 'MT940 transaction';
      let narrative: string | undefined;
      if (rawLines[i + 1]?.startsWith(':86:')) {
        narrative = rawLines[i + 1].slice(4).trim();
        description = narrative || description;
        i++;
      }

      const sourceRowId = `mt940_${index}_${date}_${amount.toFixed(2)}`;
      lines.push({
        sourceRowId,
        externalRefId: reference ?? sourceRowId,
        date,
        valueDate,
        description,
        reference,
        amount,
        direction,
        raw: { tag61: line, tag86: narrative },
      });
      index++;
    } catch (err) {
      parseErrors.push({
        rowIndex: index,
        raw: line,
        reason: err instanceof Error ? err.message : 'Unparseable MT940 :61: line.',
      });
      index++;
    }
  }

  if (lines.length === 0 && parseErrors.length === 0) {
    throw new Error('No ":61:" statement lines found in MT940 file.');
  }

  return { lines, parseErrors, format: 'mt940', openingBalance, closingBalance, periodStart, periodEnd };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function parseStatementFile(format: StatementFileFormat, content: string): ParsedStatement {
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
