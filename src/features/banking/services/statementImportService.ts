import type { BankStatement, BankStatementLine, ID } from '@/types';
import type { IBankStatementRepository } from '../repositories/IBankStatementRepository';
import type { IBankStatementLineRepository } from '../repositories/IBankStatementLineRepository';
import type { ParsedStatement, ParsedStatementLine, StatementFileFormat } from '../types';
import { detectStatementFormat, parseStatementFile, signedLineAmount } from '../utils/statementParsers';
import { sha256Hex } from '../utils/sha256';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Result of the PART L balance-integrity check. This is a statement about the
 * *file*, never about the books: `ok: false` means the statement's own lines
 * do not sum from its stated opening to its stated closing balance.
 * `ok: null` means the file did not carry both figures, so nothing can be
 * asserted either way.
 */
export interface StatementBalanceCheck {
  ok: boolean | null;
  /** The closing balance the file states, when it carries one. */
  expectedClosing?: number;
  /** openingBalance + Σ signed(line amounts). */
  impliedClosing?: number;
  /** impliedClosing − expectedClosing (0 when the statement foots). */
  delta?: number;
}

export interface StatementImportPreview {
  bankAccountId: ID;
  fileName: string;
  format: StatementFileFormat;
  parsed: ParsedStatement;
  /** sha-256 of the normalised, order-independent line set. */
  contentHash: string;
  /** Set when a statement with this exact content hash was already imported for this account. */
  duplicateOf?: BankStatement;
  balanceCheck: StatementBalanceCheck;
}

export interface ConfirmImportResult {
  statement: BankStatement;
  lineCount: number;
}

/** One line's contribution to the content hash — order-independent by construction (see `hashStatementLines`). */
function canonicalLineKey(line: ParsedStatementLine): string {
  const desc = line.description.trim().replace(/\s+/g, ' ').toLowerCase();
  return [
    line.date,
    line.direction,
    line.amount.toFixed(2),
    desc,
    line.externalRefId ?? line.reference ?? '',
  ].join('|');
}

/**
 * A deterministic fingerprint of a parsed statement's transaction set. The
 * per-line keys are SORTED before hashing, so re-exporting the same
 * statement with its rows in a different order produces the SAME hash — the
 * dedup check must not be defeated by row order.
 */
export function hashStatementLines(lines: ParsedStatementLine[]): string {
  const keys = lines.map(canonicalLineKey).sort();
  return sha256Hex(keys.join('\n'));
}

/** PART L: does `openingBalance + Σ signed(line) ≈ closingBalance`? */
export function computeBalanceCheck(parsed: ParsedStatement): StatementBalanceCheck {
  const netMovement = parsed.lines.reduce((sum, line) => sum + signedLineAmount(line), 0);
  if (parsed.openingBalance === undefined || parsed.closingBalance === undefined) {
    return { ok: null, expectedClosing: parsed.closingBalance, impliedClosing: undefined };
  }
  const impliedClosing = round2(parsed.openingBalance + netMovement);
  const delta = round2(impliedClosing - parsed.closingBalance);
  return {
    ok: Math.abs(delta) <= 0.01,
    expectedClosing: parsed.closingBalance,
    impliedClosing,
    delta,
  };
}

function earliestDate(lines: ParsedStatementLine[]): string | undefined {
  return lines.reduce<string | undefined>((min, l) => (min === undefined || l.date < min ? l.date : min), undefined);
}

function latestDate(lines: ParsedStatementLine[]): string | undefined {
  return lines.reduce<string | undefined>((max, l) => (max === undefined || l.date > max ? l.date : max), undefined);
}

/**
 * The persistent statement-import path (P1.3). `previewImport` parses and
 * fingerprints a file WITHOUT writing anything; `confirmImport` then persists
 * one `BankStatement` + its `BankStatementLine` rows.
 *
 * Deliberately does NOT post to the general ledger and does NOT create
 * `bank_transactions` — import and reconciliation are separate steps
 * (docs/CURRENT_TASKS.md PART K). `bankTransactionService.importStatementLines`
 * is the superseded legacy path.
 */
export class StatementImportService {
  constructor(
    private readonly statementRepository: IBankStatementRepository,
    private readonly lineRepository: IBankStatementLineRepository,
  ) {}

  async previewImport(
    bankAccountId: ID,
    fileName: string,
    content: string,
    formatOverride?: StatementFileFormat,
  ): Promise<StatementImportPreview> {
    const format = formatOverride ?? detectStatementFormat(fileName);
    if (!format) {
      throw new Error(`Could not determine the statement format for "${fileName}" — pass a format override.`);
    }

    const parsed = parseStatementFile(format, content);
    if (parsed.lines.length === 0) {
      throw new Error('No statement lines could be read from this file.');
    }

    const contentHash = hashStatementLines(parsed.lines);
    const duplicateOf = await this.statementRepository.findByContentHash(bankAccountId, contentHash);
    const balanceCheck = computeBalanceCheck(parsed);

    return { bankAccountId, fileName, format, parsed, contentHash, duplicateOf, balanceCheck };
  }

  async confirmImport(
    bankAccountId: ID,
    preview: StatementImportPreview,
    importedBy: string,
    opts?: { allowDuplicate?: boolean; currency?: string },
  ): Promise<ConfirmImportResult> {
    if (preview.duplicateOf && !opts?.allowDuplicate) {
      throw new Error(
        `This statement was already imported (${preview.duplicateOf.sourceFilename ?? preview.duplicateOf.id}). ` +
          'Pass allowDuplicate to import it again.',
      );
    }

    const { parsed } = preview;
    const periodStart = parsed.periodStart ?? earliestDate(parsed.lines) ?? new Date().toISOString();
    const periodEnd = parsed.periodEnd ?? latestDate(parsed.lines) ?? periodStart;
    const netMovement = parsed.lines.reduce((sum, line) => sum + signedLineAmount(line), 0);
    const openingBalance = parsed.openingBalance ?? 0;
    const closingBalance = parsed.closingBalance ?? round2(openingBalance + netMovement);

    const statement = await this.statementRepository.create({
      id: '',
      createdAt: '',
      updatedAt: '',
      bankAccountId,
      sourceFilename: preview.fileName,
      sourceFormat: preview.format,
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      currency: opts?.currency ?? 'ZAR',
      lineCount: parsed.lines.length,
      importStatus: 'imported',
      reconciliationStatus: 'not_started',
      contentHash: preview.contentHash,
      importedAt: new Date().toISOString(),
      importedBy,
      balanceCheckOk: preview.balanceCheck.ok === null ? undefined : preview.balanceCheck.ok,
    });

    const lines: BankStatementLine[] = parsed.lines.map((line, i) => ({
      id: '',
      createdAt: '',
      updatedAt: '',
      bankStatementId: statement.id,
      bankAccountId,
      sequence: i + 1,
      txnDate: line.date,
      valueDate: line.valueDate,
      description: line.description,
      reference: line.reference,
      externalRefId: line.externalRefId,
      amount: line.amount,
      direction: line.direction,
      runningBalance: line.runningBalance,
      rawSource: line.raw,
      lineState: 'unmatched',
    }));

    const created = await this.lineRepository.createMany(lines);
    return { statement, lineCount: created.length };
  }
}
