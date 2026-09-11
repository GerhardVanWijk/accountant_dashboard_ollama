import { useState } from 'react';
import type { PayrollRun } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';

export interface ReversePayrollRunFormProps {
  run: PayrollRun;
  onSubmit: (reason: string, reversalDate: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The payroll-owned correction/reversal workflow (Leases + Payroll
 * integrity audit, PART 2, audit item 5) — the supported replacement for
 * an orphan manual balancing journal. Posts the exact mathematical inverse
 * of the original journal and marks this run reversed; the original
 * posting, its payslips, and its journal are never deleted or edited. A
 * genuinely corrected run for the freed pay period is then just a normal
 * new payroll run.
 */
export function ReversePayrollRunForm({ run, onSubmit, onCancel, onDirtyChange }: ReversePayrollRunFormProps) {
  const [reason, setReason] = useState('');
  const [reversalDate, setReversalDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(reason, reversalDate);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This posts a new reversing journal for the whole of run {run.runNumber} — every Salaries/UIF/PAYE/SDL/Net
          Pay line, exactly inverted. The original journal is never deleted or edited. This cannot be undone; correct
          figures must be re-run as a new payroll run for the freed period afterward.
        </p>
        <Field>
          <FieldLabel htmlFor="reversalDate">Reversal Date</FieldLabel>
          <Input id="reversalDate" type="date" value={reversalDate} onChange={(e) => setReversalDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="reason">Reason</FieldLabel>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Overtime for EMP-0004 was captured twice — reversing to re-run with the correct figure."
            rows={3}
          />
          <FieldDescription>Required — kept permanently on this run's history alongside the reversal journal.</FieldDescription>
        </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={submitting || !reason.trim() || !reversalDate} onClick={() => void submit()}>
          Reverse Run
        </Button>
      </FormFooter>
    </div>
  );
}
