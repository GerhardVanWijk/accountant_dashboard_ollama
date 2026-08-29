import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';

export interface PayrollRunFormProps {
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  defaultPayDate: string;
  onSubmit: (payPeriodStart: string, payPeriodEnd: string, payDate: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Creates a new draft PayrollRun covering every active employee for the
 * chosen period — see PayrollRunsPage for how the resulting draft is
 * reviewed. Re-skinned onto v0's Field/Input (M13); no payroll math here.
 */
export function PayrollRunForm({ defaultPeriodStart, defaultPeriodEnd, defaultPayDate, onSubmit, onCancel, onDirtyChange }: PayrollRunFormProps) {
  const [payPeriodStart, setPayPeriodStart] = useState(defaultPeriodStart);
  const [payPeriodEnd, setPayPeriodEnd] = useState(defaultPeriodEnd);
  const [payDate, setPayDate] = useState(defaultPayDate);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(payPeriodStart, payPeriodEnd, payDate);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="payPeriodStart">Pay Period Start</FieldLabel>
          <Input id="payPeriodStart" type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="payPeriodEnd">Pay Period End</FieldLabel>
          <Input id="payPeriodEnd" type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="payDate">Pay Date</FieldLabel>
        <Input id="payDate" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        <FieldDescription>
          Computes a draft payslip for every active employee from their standard salary/allowances/deductions, using
          whichever SARS tax year&apos;s PAYE/UIF/SDL configuration covers this pay date. Nothing posts to the GL
          until you review and post the run.
        </FieldDescription>
      </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !payPeriodStart || !payPeriodEnd || !payDate} onClick={() => void submit()}>
          Create Draft Run
        </Button>
      </FormFooter>
    </div>
  );
}
