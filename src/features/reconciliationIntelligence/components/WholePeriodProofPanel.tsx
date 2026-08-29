import type { WholePeriodProof, BooksToStatementItem } from '../services';
import { HelpTip } from './HelpTip';

/**
 * PART I — the whole-period proof, both directions:
 *   • statement → books: statement lines with no accounting counterpart
 *     (omitted bank charges, interest, debit orders).
 *   • books → statement: accounting entries in the period with no statement
 *     line — each tagged outstanding-timing / duplicate / wrong-account / none.
 * This is where outstanding payments and deposits surface.
 */
const BOOKS_REASON_LABEL: Record<BooksToStatementItem['reason'], string> = {
  matched: 'Matched',
  grouped: 'Part of a grouped match',
  outstanding_timing: 'Outstanding — timing',
  duplicate: 'Possible duplicate',
  wrong_account: 'Possibly on the wrong bank account',
  none: 'No statement line',
};

export function WholePeriodProofPanel({ proof }: { proof: WholePeriodProof | null }) {
  if (!proof) {
    return <p className="text-sm text-muted-foreground">Run the whole-period proof to check both sides of the statement.</p>;
  }

  const { statementToBooks, booksToStatement } = proof;
  const missingLines = statementToBooks.items.filter((i) => !i.hasCounterpart);
  const booksOnly = booksToStatement.items.filter((i) => !i.hasStatementLine);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Window {proof.windowStart} to {proof.windowEnd}
      </p>

      <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold">
          Statement lines without an accounting counterpart <HelpTip tip="missingInBooks" />
        </h3>
        <p className="text-xs text-muted-foreground">
          {statementToBooks.withCounterpart} of {statementToBooks.total} statement lines have a counterpart · {missingLines.length} do not
        </p>
        {missingLines.length === 0 ? (
          <p className="text-sm text-status-positive">Every statement line has a matching accounting entry.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {missingLines.map((i) => (
              <li key={i.lineId} className="py-1.5 font-mono text-xs">
                {i.lineId}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold">
          Accounting entries in the period without a statement line <HelpTip tip="outstanding" />
        </h3>
        <p className="text-xs text-muted-foreground">
          {booksToStatement.withStatementLine} of {booksToStatement.total} accounting entries appear on the statement · {booksOnly.length} do not
        </p>
        {booksOnly.length === 0 ? (
          <p className="text-sm text-status-positive">Every accounting entry for the period is on the statement.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {booksOnly.map((i) => (
              <li key={i.booksId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="font-mono text-xs">{i.booksId}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {BOOKS_REASON_LABEL[i.reason]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
