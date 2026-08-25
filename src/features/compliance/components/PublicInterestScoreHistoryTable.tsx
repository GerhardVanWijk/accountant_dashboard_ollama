import type { PublicInterestScore } from '@/types';
import { Badge } from '@/components/ui/shadcn/badge';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';

const ASSURANCE_LABELS = {
  audit_required: 'Audit required',
  independent_review_required: 'Independent review required',
} as const;

export interface PublicInterestScoreHistoryTableProps {
  history: PublicInterestScore[];
  financialYearName: (financialYearId: string) => string;
}

/** Every prior Public Interest Score calculation for this company, newest first. Re-skinned onto shadcn table styling (M7); no logic changes. */
export function PublicInterestScoreHistoryTable({ history, financialYearName }: PublicInterestScoreHistoryTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Financial Year</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Calculated</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Employees</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Turnover</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">3rd-Party Liab.</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Shareholders</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Score</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Assurance</th>
          </tr>
        </thead>
        <tbody>
          {history.map((score) => (
            <tr key={score.id} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2.5">{financialYearName(score.financialYearId)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDate(score.calculatedAt)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{score.employeePoints}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(score.components.turnover)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(score.components.thirdPartyLiabilities)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{score.shareholderPoints}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{score.totalScore}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <Badge className={cn(score.suggestedAssuranceLevel === 'audit_required' ? 'bg-warning/15 text-warning' : 'bg-positive/15 text-positive')}>
                  {ASSURANCE_LABELS[score.suggestedAssuranceLevel]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
