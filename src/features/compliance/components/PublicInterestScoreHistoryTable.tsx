import type { PublicInterestScore } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';

const ASSURANCE_LABELS = {
  audit_required: 'Audit required',
  independent_review_required: 'Independent review required',
} as const;

export interface PublicInterestScoreHistoryTableProps {
  history: PublicInterestScore[];
  financialYearName: (financialYearId: string) => string;
}

/** Every prior Public Interest Score calculation for this company, newest first — SA_ACCOUNTING_MASTER_SPEC.md §3's "retain historical scores". */
export function PublicInterestScoreHistoryTable({ history, financialYearName }: PublicInterestScoreHistoryTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Financial Year</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Calculated</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Employees</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Turnover</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">3rd-Party Liab.</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Shareholders</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Score</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Assurance</th>
          </tr>
        </thead>
        <tbody>
          {history.map((score) => (
            <tr key={score.id} className="border-t border-border/50">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{financialYearName(score.financialYearId)}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-secondary">{score.calculatedAt.slice(0, 10)}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{score.employeePoints}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={score.components.turnover} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={score.components.thirdPartyLiabilities} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{score.shareholderPoints}</td>
              <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">{score.totalScore}</td>
              <td className="whitespace-nowrap px-md py-sm">
                <span
                  className={cn(
                    'rounded-full px-sm py-0.5 text-xs font-semibold',
                    score.suggestedAssuranceLevel === 'audit_required' ? 'bg-warning/10 text-warning-financial' : 'bg-positive/10 text-positive',
                  )}
                >
                  {ASSURANCE_LABELS[score.suggestedAssuranceLevel]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
