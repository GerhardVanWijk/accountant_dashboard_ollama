import { useState } from 'react';
import type { PayrollRun } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';

export interface PayslipLinesTableProps {
  run: PayrollRun;
  onOverrideChange?: (employeeId: string, overtime: number, bonus: number) => Promise<void>;
}

/**
 * Shows every employee's computed payslip line for a run. When the run is
 * still 'draft' and onOverrideChange is supplied, overtime/bonus are
 * editable inline — each edit recomputes that one line through
 * payrollRunService.updatePayslipOverride() (the same computePayslipLine()
 * path the run was originally created with), never hand-edited. Kept as a
 * purpose-built table rather than the generic DataTable — a footer totals
 * row and inline per-cell editing don't fit that shared abstraction. Every
 * figure is read straight off the PayrollRun record; no payroll math is
 * performed in this component. Re-skinned onto v0's visual language (M13).
 */
export function PayslipLinesTable({ run, onOverrideChange }: PayslipLinesTableProps) {
  const editable = run.status === 'draft' && !!onOverrideChange;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overtimeDraft, setOvertimeDraft] = useState('0');
  const [bonusDraft, setBonusDraft] = useState('0');
  const [saving, setSaving] = useState(false);

  const startEdit = (employeeId: string, overtime: number, bonus: number) => {
    setEditingId(employeeId);
    setOvertimeDraft(String(overtime));
    setBonusDraft(String(bonus));
  };

  const save = async (employeeId: string) => {
    if (!onOverrideChange) return;
    setSaving(true);
    try {
      await onOverrideChange(employeeId, Number(overtimeDraft) || 0, Number(bonusDraft) || 0);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const totals = run.payslips.reduce(
    (acc, p) => ({
      grossPay: acc.grossPay + p.grossPay,
      paye: acc.paye + p.paye,
      uifEmployee: acc.uifEmployee + p.uifEmployee,
      uifEmployer: acc.uifEmployer + p.uifEmployer,
      sdlEmployer: acc.sdlEmployer + p.sdlEmployer,
      deductionsTotal: acc.deductionsTotal + p.deductionsTotal,
      netPay: acc.netPay + p.netPay,
    }),
    { grossPay: 0, paye: 0, uifEmployee: 0, uifEmployer: 0, sdlEmployer: 0, deductionsTotal: 0, netPay: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Basic</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Overtime</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Bonus</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Allowances</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Gross Pay</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">PAYE</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">UIF (Emp)</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">UIF (Er)</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">SDL</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Deductions</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Net Pay</th>
            {editable && <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground" />}
          </tr>
        </thead>
        <tbody>
          {run.payslips.map((line) => (
            <tr key={line.employeeId} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2.5">
                <div className="font-medium text-foreground">{line.employeeName}</div>
                <div className="figure text-xs text-muted-foreground">{line.employeeNumber}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={line.basicSalary} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                {editable && editingId === line.employeeId ? (
                  <Input aria-label="Overtime" type="number" step="0.01" className="text-right" value={overtimeDraft} onChange={(e) => setOvertimeDraft(e.target.value)} />
                ) : (
                  <Amount value={line.overtime} plain className="text-sm" />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                {editable && editingId === line.employeeId ? (
                  <Input aria-label="Bonus" type="number" step="0.01" className="text-right" value={bonusDraft} onChange={(e) => setBonusDraft(e.target.value)} />
                ) : (
                  <Amount value={line.bonus} plain className="text-sm" />
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={line.allowancesTotal} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">
                <Amount value={line.grossPay} plain className="text-sm font-semibold" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={-line.paye} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={-line.uifEmployee} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={-line.uifEmployer} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={-line.sdlEmployer} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={-line.deductionsTotal} plain className="text-sm" />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">
                <Amount value={line.netPay} className="text-sm font-semibold" />
              </td>
              {editable && (
                <td className="whitespace-nowrap px-4 py-2.5">
                  {editingId === line.employeeId ? (
                    <div className="flex gap-1">
                      <Button type="button" size="sm" disabled={saving} onClick={() => void save(line.employeeId)}>
                        Save
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(line.employeeId, line.overtime, line.bonus)}>
                      Edit
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
            <td className="whitespace-nowrap px-4 py-2.5" colSpan={5}>
              Totals
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.grossPay} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={-totals.paye} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={-totals.uifEmployee} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={-totals.uifEmployer} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={-totals.sdlEmployer} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={-totals.deductionsTotal} plain className="text-sm font-semibold" />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.netPay} className="text-sm font-semibold" />
            </td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
