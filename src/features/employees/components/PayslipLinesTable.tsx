import { useState } from 'react';
import type { PayrollRun } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldInput } from './formStyles';

export interface PayslipLinesTableProps {
  run: PayrollRun;
  onOverrideChange?: (employeeId: string, overtime: number, bonus: number) => Promise<void>;
}

/**
 * Shows every employee's computed payslip line for a run. When the run is
 * still 'draft' and onOverrideChange is supplied, overtime/bonus are
 * editable inline — each edit recomputes that one line through
 * payrollRunService.updatePayslipOverride() (the same computePayslipLine()
 * path the run was originally created with), never hand-edited.
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
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Employee</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Basic</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Overtime</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Bonus</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Allowances</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Gross Pay</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">PAYE</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">UIF (Emp)</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">UIF (Er)</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">SDL</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Deductions</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Net Pay</th>
            {editable && <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />}
          </tr>
        </thead>
        <tbody>
          {run.payslips.map((line) => (
            <tr key={line.employeeId} className="border-t border-border hover:bg-background">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                <div className="font-medium">{line.employeeName}</div>
                <div className="font-mono text-xs text-text-secondary">{line.employeeNumber}</div>
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.basicSalary} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                {editable && editingId === line.employeeId ? (
                  <input
                    aria-label="Overtime"
                    type="number"
                    step="0.01"
                    className={fieldInput}
                    value={overtimeDraft}
                    onChange={(e) => setOvertimeDraft(e.target.value)}
                  />
                ) : (
                  <FinancialNumber value={line.overtime} format={formatCurrency} showFlash={false} />
                )}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                {editable && editingId === line.employeeId ? (
                  <input
                    aria-label="Bonus"
                    type="number"
                    step="0.01"
                    className={fieldInput}
                    value={bonusDraft}
                    onChange={(e) => setBonusDraft(e.target.value)}
                  />
                ) : (
                  <FinancialNumber value={line.bonus} format={formatCurrency} showFlash={false} />
                )}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.allowancesTotal} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums font-semibold">
                <FinancialNumber value={line.grossPay} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.paye} format={formatCurrency} showFlash={false} isInverted />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.uifEmployee} format={formatCurrency} showFlash={false} isInverted />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.uifEmployer} format={formatCurrency} showFlash={false} isInverted />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.sdlEmployer} format={formatCurrency} showFlash={false} isInverted />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={line.deductionsTotal} format={formatCurrency} showFlash={false} isInverted />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums font-semibold">
                <FinancialNumber value={line.netPay} format={formatCurrency} showFlash={false} />
              </td>
              {editable && (
                <td className="whitespace-nowrap px-md py-sm">
                  {editingId === line.employeeId ? (
                    <div className="flex gap-xs">
                      <Button type="button" onClick={() => save(line.employeeId)} disabled={saving}>
                        Save
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(line.employeeId, line.overtime, line.bonus)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-background font-semibold">
            <td className="whitespace-nowrap px-md py-sm" colSpan={5}>
              Totals
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.grossPay} format={formatCurrency} showFlash={false} />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.paye} format={formatCurrency} showFlash={false} isInverted />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.uifEmployee} format={formatCurrency} showFlash={false} isInverted />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.uifEmployer} format={formatCurrency} showFlash={false} isInverted />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.sdlEmployer} format={formatCurrency} showFlash={false} isInverted />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.deductionsTotal} format={formatCurrency} showFlash={false} isInverted />
            </td>
            <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
              <FinancialNumber value={totals.netPay} format={formatCurrency} showFlash={false} />
            </td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
