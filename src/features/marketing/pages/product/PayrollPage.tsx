import { FileTextIcon, LandmarkIcon, ReceiptIcon, UsersIcon } from 'lucide-react';

import { ProductPageTemplate } from '../../components/ProductPageTemplate';

/** /product/payroll — public website completion pass. Every capability below is verified against src/features/employees/. */
export function PayrollPage() {
  return (
    <ProductPageTemplate
      kicker="Payroll"
      title="PAYE, UIF and SDL calculated on verified SARS tables"
      description="Run payroll and get the statutory reports ready, without filing them for you."
      capabilities={[
        {
          icon: UsersIcon,
          title: 'Employee records',
          body: "Keep your employee master data in one place, linked to every payslip they're on.",
        },
        {
          icon: ReceiptIcon,
          title: 'Payslip calculations',
          body: 'PAYE (with age-based rebates), UIF and SDL calculated per payslip on SARS-published tables, verified against SARS’s own published rates.',
        },
        {
          icon: LandmarkIcon,
          title: 'One balanced entry per run',
          body: 'A payroll run posts one balanced ledger entry — net pay, and every statutory deduction, to its own liability account.',
        },
        {
          icon: FileTextIcon,
          title: 'EMP201 and EMP501',
          body: 'Monthly EMP201 and annual EMP501 figures computed straight from your posted payroll runs, ready for your own SARS submission.',
        },
      ]}
      notIncluded={['Direct EMP201/EMP501 filing with SARS', 'Payslip or IRP5 document generation or emailing']}
      ctaTitle="See a real payroll run and EMP201"
      ctaBody="Walk through payroll calculations in the live demo."
    />
  );
}
