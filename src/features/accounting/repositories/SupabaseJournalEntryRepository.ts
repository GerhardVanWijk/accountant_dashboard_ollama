import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry, JournalLine, ID } from '@/types';
import type { IJournalEntryRepository } from './IJournalEntryRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface JournalLineRow {
  id: string;
  account_id: string;
  description: string | null;
  debit: number;
  credit: number;
  line_no: number;
}

interface JournalEntryRow {
  id: string;
  company_id: string;
  entry_number: string;
  date: string;
  memo: string | null;
  status: string;
  posted_at: string | null;
  currency: string | null;
  source: string;
  reversal_of_entry_id: string | null;
  created_at: string;
  updated_at: string;
  journal_lines?: JournalLineRow[];
}

/** Half a cent — same rounding tolerance as JournalEntryService's BALANCE_EPSILON. */
const BALANCE_EPSILON = 0.005;

/**
 * Independently re-checks sum(debit) === sum(credit) before this repository
 * ever reaches the database — the same defense-in-depth re-check
 * MockJournalEntryRepository performs (see its doc comment). The database
 * itself only enforces per-line shape (journal_lines' CHECK constraints,
 * docs/SUPABASE_MIGRATION_GUIDE.md Phase C) and referential integrity, not
 * the cross-line balance sum — that remains application-level only, per
 * docs/LEDGER_ARCHITECTURE.md's "Known gaps".
 */
function assertBalanced(entry: JournalEntry): void {
  const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
    throw new Error(
      `SupabaseJournalEntryRepository refused to post an unbalanced entry "${entry.entryNumber || '(unnumbered)'}": total debits ${totalDebit.toFixed(2)} !== total credits ${totalCredit.toFixed(2)}. This should be unreachable via JournalEntryService — something bypassed it.`,
    );
  }
}

function rowToLine(row: JournalLineRow): JournalLine {
  return {
    id: row.id,
    accountId: row.account_id,
    description: row.description ?? undefined,
    debit: Number(row.debit),
    credit: Number(row.credit),
  };
}

function rowToEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entryNumber: row.entry_number,
    date: row.date,
    memo: row.memo ?? undefined,
    status: row.status as JournalEntry['status'],
    postedAt: row.posted_at ?? undefined,
    currency: row.currency ?? undefined,
    source: row.source,
    reversalOfEntryId: row.reversal_of_entry_id ?? undefined,
    lines: (row.journal_lines ?? [])
      .slice()
      .sort((a, b) => a.line_no - b.line_no)
      .map(rowToLine),
  };
}

/**
 * Supabase-backed IJournalEntryRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase C). Like SupabaseAccountRepository, resolves "the" company
 * internally — JournalEntry has no companyId field, and the app is
 * single-tenant today.
 *
 * create() posts the header + every line through one Postgres function
 * (`create_journal_entry_with_lines`, `SECURITY INVOKER` so RLS still
 * applies as the calling user) instead of two separate `.insert()` calls —
 * both inserts run inside that function's single implicit transaction, so
 * a bad line (an unknown account_id, a same-line debit+credit, an
 * all-zero line — the journal_lines CHECK constraints) rolls the header
 * insert back too. Two sequential client-side `.insert()` calls could not
 * offer that guarantee: a header could commit with zero or partial lines
 * if the second call failed midway.
 */
export class SupabaseJournalEntryRepository implements IJournalEntryRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (this.cachedCompanyId) return this.cachedCompanyId;
    const { data, error } = await this.client
      .from('companies')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`SupabaseJournalEntryRepository: failed to resolve the company for a new journal entry: ${error.message}`);
    if (!data) throw new Error('SupabaseJournalEntryRepository: no Company exists yet — create one before posting journal entries.');
    this.cachedCompanyId = data.id as ID;
    return this.cachedCompanyId;
  }

  async getAll(): Promise<JournalEntry[]> {
    const { data, error } = await this.client
      .from('journal_entries')
      .select('*, journal_lines(*)')
      .order('date', { ascending: true });
    if (error) throw new Error(`SupabaseJournalEntryRepository.getAll: ${error.message}`);
    return (data as JournalEntryRow[]).map(rowToEntry);
  }

  async getById(id: ID): Promise<JournalEntry | undefined> {
    const { data, error } = await this.client
      .from('journal_entries')
      .select('*, journal_lines(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseJournalEntryRepository.getById: ${error.message}`);
    }
    return data ? rowToEntry(data as JournalEntryRow) : undefined;
  }

  async create(entity: JournalEntry): Promise<JournalEntry> {
    assertBalanced(entity);
    const companyId = await this.resolveCompanyId();

    const { data, error } = await this.client.rpc('create_journal_entry_with_lines', {
      p_company_id: companyId,
      // A blank number → the DB allocates it atomically via
      // `allocate_journal_number` (migration 0033). `JournalEntryService`
      // stopped computing the number in Phase 3C.
      p_entry_number: entity.entryNumber || null,
      p_date: entity.date,
      p_memo: entity.memo ?? null,
      p_status: entity.status,
      p_posted_at: entity.postedAt ?? null,
      p_currency: entity.currency ?? null,
      p_source: entity.source,
      p_reversal_of_entry_id: entity.reversalOfEntryId ?? null,
      p_lines: entity.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
    });
    if (error) throw new Error(`SupabaseJournalEntryRepository.create: ${error.message}`);

    const created = await this.getById((data as { id: string }).id);
    if (!created) throw new Error('SupabaseJournalEntryRepository.create: entry was posted but could not be re-read.');
    return created;
  }
}
