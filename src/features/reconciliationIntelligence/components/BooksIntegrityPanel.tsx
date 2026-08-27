import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import type { BooksIntegrityCheckResult } from '../booksIntegrity/checks';

const ICON = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  not_checked: HelpCircle,
} as const;

const ICON_CLASS = {
  pass: 'text-status-positive',
  warning: 'text-status-warning',
  not_checked: 'text-muted-foreground',
} as const;

/** The whole-books integrity summary — makes it obvious whether a reconciliation gap is bank-only or a deeper GL/subledger/opening-balance problem. */
export function BooksIntegrityPanel({ results }: { results: BooksIntegrityCheckResult[] }) {
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">No checks run yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {results.map((result) => {
        const Icon = ICON[result.status];
        return (
          <li key={result.key} className="flex items-start gap-3 py-3">
            <Icon className={`mt-0.5 size-4 shrink-0 ${ICON_CLASS[result.status]}`} aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{result.label}</span>
              <span className="text-xs text-muted-foreground">{result.detail}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
