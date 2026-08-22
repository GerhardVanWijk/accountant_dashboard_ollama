import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface PayrollRunFormProps {
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  defaultPayDate: string;
  onSubmit: (payPeriodStart: string, payPeriodEnd: string, payDate: string) => Promise<void>;
  onCancel: () => void;
}

/** Creates a new draft PayrollRun covering every active employee for the chosen period — see PayrollRunsPage for how the resulting draft is reviewed. */
export function PayrollRunForm({ defaultPeriodStart, defaultPeriodEnd, defaultPayDate, onSubmit, onCancel }: PayrollRunFormProps) {
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
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="payPeriodStart">
            Pay Period Start
          </label>
          <input id="payPeriodStart" type="date" className={fieldInput} value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="payPeriodEnd">
            Pay Period End
          </label>
          <input id="payPeriodEnd" type="date" className={fieldInput} value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="payDate">
          Pay Date
        </label>
        <input id="payDate" type="date" className={fieldInput} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        <p className={fieldHint}>
          Computes a draft payslip for every active employee from their standard salary/allowances/deductions, using
          whichever SARS tax year's PAYE/UIF/SDL configuration covers this pay date. Nothing posts to the GL until
          you review and post the run.
        </p>
      </div>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || !payPeriodStart || !payPeriodEnd || !payDate}>
          Create Draft Run
        </Button>
      </div>
    </div>
  );
}
