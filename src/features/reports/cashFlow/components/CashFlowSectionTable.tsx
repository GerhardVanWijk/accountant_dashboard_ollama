import { Amount } from '@/components/app/figure';
import type { CashFlowSection } from '../services';

export interface CashFlowSectionTableProps {
  title: string;
  section: CashFlowSection;
}

/**
 * One classified section of the Statement of Cash Flows (Operating,
 * Investing, or Financing) — its line items followed by a subtotal row.
 * Re-skinned onto v0's statement visual language (M9), mirroring
 * `financialStatements/components/StatementRow.tsx` so every report in
 * this module renders amounts identically; no cash-flow math happens here.
 */
export function CashFlowSectionTable({ title, section }: CashFlowSectionTableProps) {
  return (
    <div>
      <div className="pt-6 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">{title}</div>
      {section.items.map((item) => (
        <div key={item.label} className="grid grid-cols-[1fr_auto] items-baseline gap-2 py-2">
          <span className="pl-4 text-muted-foreground">{item.label}</span>
          <Amount value={item.amount} statement className="text-sm" />
        </div>
      ))}
      <div className="mt-1 grid grid-cols-[1fr_auto] items-baseline gap-2 border-t border-border py-2 font-semibold">
        <span>Net Cash from {title}</span>
        <Amount value={section.total} statement className="text-sm font-semibold" />
      </div>
    </div>
  );
}
