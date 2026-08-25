import { useState } from 'react';
import { Building2, CalendarDays, Loader2, Pencil, Receipt } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/shadcn/empty';
import { useCompany } from '../hooks/useCompany';
import { companyService } from '../services';
import { CompanyForm } from '../components/CompanyForm';
import { formValuesToCompanyPatch } from '../utils/companyFormSchema';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function financialYearEndLabel(month: number, day: number): string {
  return `${day} ${MONTH_NAMES[month - 1] ?? month}`;
}

/**
 * Companies page (M2, docs/V0_DASHBOARD_INTEGRATION.md). Adapted from
 * v0's multi-company Companies page + CompanySwitcher: the real backend
 * models exactly one company (src/types/company.ts's doc comment — "this
 * app is single-tenant... there is no multi-company switching yet"), so
 * this renders that one real Company using v0's card visual language and
 * an edit form, with no switcher and no multi-company stat rail (both
 * would be fabricated — there is nothing to switch between or count).
 *
 * v0's CompanyCard also shows industry, a physical address, and a
 * contact email/phone — the real Company type has none of those fields
 * (docs/DO_NOT_BREAK.md: no invented figures), so this card omits them
 * rather than displaying placeholders.
 */
export function CompanyPage() {
  const { company, loading, error, refetch } = useCompany();
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading company…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (!company) {
    return (
      <SectionCard>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No company on file</EmptyTitle>
            <EmptyDescription>A company record has not been created yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader
        title="Companies"
        description="This is a single-company workspace — every ledger, register and report in the app belongs to this one company file."
        actions={
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            Edit company
          </Button>
        }
      />

      <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-balance">{company.name}</h2>
            <p className="text-xs text-muted-foreground">Registration {company.registrationNumber ?? 'not recorded'}</p>
          </div>
          <StatusBadge status={company.isActive ? 'active' : 'inactive'} />
        </header>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">VAT number</dt>
            <dd className="figure text-foreground tabular-nums">{company.vatRegistrationNumber ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Income tax number</dt>
            <dd className="figure text-foreground tabular-nums">{company.incomeTaxNumber ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Functional currency</dt>
            <dd className="text-foreground">{company.functionalCurrency}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Accounting basis</dt>
            <dd className="text-foreground capitalize">{company.accountingBasis}</dd>
          </div>
        </dl>

        <ul className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-6">
          <li className="flex items-center gap-2">
            <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
            {company.legalEntityType.replace(/_/g, ' ')}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            Year end {financialYearEndLabel(company.financialYearEndMonth, company.financialYearEndDay)}
          </li>
          <li className="flex items-center gap-2">
            <Receipt className="size-3.5 shrink-0" aria-hidden="true" />
            {company.isVatRegistered ? `VAT registered, filed ${(company.vatFilingFrequency ?? 'not set').replace('_', '-')}` : 'Not VAT registered'}
          </li>
        </ul>
      </article>

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          setEditing(open);
          if (!open) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit company</DialogTitle>
          </DialogHeader>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <CompanyForm
            company={company}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              setSaveError(null);
              try {
                await companyService.updateCompany(company.id, formValuesToCompanyPatch(values));
                setEditing(false);
                refetch();
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Could not save company.');
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
