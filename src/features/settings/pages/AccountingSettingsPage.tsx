import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Loader2, ShieldCheck } from 'lucide-react';
import type { Account } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { accountService, categoryAccountMappingService } from '@/features/accounting/services';
import type { CategoryAccountMappingRecord } from '@/features/accounting/repositories';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const VAT_FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  bi_monthly: 'Every 2 months',
  six_monthly: 'Every 6 months',
  annual: 'Annually',
};

interface ConfigRow {
  label: string;
  value: string;
  note?: string;
}

interface ConfigLink {
  href: string;
  name: string;
  description: string;
}

const RELATED_LINKS: ConfigLink[] = [
  { href: '/financial-periods', name: 'Financial periods', description: 'Open, soft-close and close accounting periods for the current financial year.' },
  { href: '/tax/rates', name: 'Tax rates', description: 'VAT and other tax rates available when capturing transactions, including superseding an existing rate.' },
  { href: '/tax/vat-return', name: 'VAT return', description: 'Output and input VAT for real posted documents this period.' },
  { href: '/accounting/coa', name: 'Chart of accounts', description: 'The ledger accounts every transaction posts against.' },
];

/**
 * Accounting Settings — route `/settings/accounting`. This is a real
 * configuration view, not a link hub: it shows the accounting settings the
 * Vertex engine actually reads (accounting basis, functional/presentation
 * currency, financial year end, VAT registration/frequency/basis, financial
 * statements compilation) with the live company values, and the
 * per-category revenue/COGS/inventory account mappings the posting engine
 * resolves against (`category_account_mappings`, migration 0019).
 *
 * The editable copies of the company-level settings live on the Company
 * page (`/companies` → CompanyForm) so there is one authoritative form, not
 * two. Every change to those fields now writes an Audit Trail row with
 * before/after values (migration 0074 trigger), regardless of which path
 * makes it. Settings the engine genuinely does NOT support — document
 * numbering prefixes, a configurable rounding rule, a default sales/expense
 * account map — are called out as not built rather than faked.
 */
export function AccountingSettingsPage() {
  useLogSensitiveAccess('Accounting settings');
  const { company, loading: companyLoading } = useCompany();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mappings, setMappings] = useState<CategoryAccountMappingRecord[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([accountService.getAccounts(), categoryAccountMappingService.getAll()])
      .then(([acc, maps]) => {
        if (cancelled) return;
        setAccounts(acc);
        setMappings(maps);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setMappingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accountLabel = useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return (id: string | undefined) => {
      if (!id) return 'Default (generic account)';
      const a = byId.get(id);
      return a ? `${a.code} · ${a.name}` : 'Unknown account';
    };
  }, [accounts]);

  const configRows: ConfigRow[] = company
    ? [
        {
          label: 'Accounting basis',
          value: company.accountingBasis === 'cash' ? 'Cash' : 'Accrual',
          note: 'Drives when revenue and expenses are recognised. Changing it after transactions are posted is a high-risk change and is audited.',
        },
        {
          label: 'Functional currency',
          value: company.functionalCurrency,
          note: 'Transactions are captured and posted in this currency. A separate transaction currency is not yet supported.',
        },
        {
          label: 'Presentation currency',
          value: company.presentationCurrency,
        },
        {
          label: 'Financial year end',
          value: `${company.financialYearEndDay} ${MONTHS[company.financialYearEndMonth] ?? ''}`.trim(),
          note: 'Defines the 12 accounting periods. Change with care once a year has periods — reports and comparatives depend on it.',
        },
        {
          label: 'VAT registered',
          value: company.isVatRegistered ? `Yes${company.vatRegistrationNumber ? ` · ${company.vatRegistrationNumber}` : ''}` : 'No',
        },
        ...(company.isVatRegistered
          ? [
              {
                label: 'VAT filing frequency',
                value: company.vatFilingFrequency ? VAT_FREQUENCY_LABELS[company.vatFilingFrequency] ?? company.vatFilingFrequency : 'Not set',
                note: 'Used to work out when the VAT return and payment are due (Notifications).',
              },
              {
                label: 'VAT accounting basis',
                value: company.vatAccountingBasis === 'payments' ? 'Payments basis' : 'Invoice basis',
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounting settings"
        description="The accounting configuration the Vertex engine uses for this company, and the account mappings your postings resolve against."
        actions={
          <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Settings
          </Link>
        }
      />

      <SectionCard
        title="Effective configuration"
        description="Read here, edited on the Company page — one authoritative form. Every change is recorded in the Audit trail with before and after values."
        actions={
          <Link to="/companies" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Edit on Company page
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      >
        {companyLoading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading company configuration…
          </div>
        ) : !company ? (
          <p className="text-sm text-muted-foreground">No company set up yet.</p>
        ) : (
          <dl className="flex flex-col divide-y divide-border">
            {configRows.map((row) => (
              <div key={row.label} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                <dt className="text-sm font-medium text-foreground">{row.label}</dt>
                <dd className="flex flex-col gap-0.5 sm:max-w-md sm:text-right">
                  <span className="text-sm text-foreground">{row.value}</span>
                  {row.note && <span className="text-xs leading-relaxed text-muted-foreground">{row.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Reporting framework and SBC eligibility are also accounting settings, but they can only be changed on the
          Company page and always require a recorded reason — they are audited overrides, not plain field edits.
        </p>
      </SectionCard>

      <SectionCard
        title="Category account mappings"
        description="When a product has a category, its sales and purchases post to these accounts instead of the generic revenue / cost-of-sales / inventory accounts. Set up alongside your chart of accounts."
      >
        {mappingsLoading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading mappings…
          </div>
        ) : mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category-specific mappings. Every category posts to the generic revenue, cost-of-sales and inventory
            accounts.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Revenue</th>
                  <th className="py-2 pr-4">Cost of sales</th>
                  <th className="py-2">Inventory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mappings.map((m) => (
                  <tr key={m.categoryName}>
                    <td className="py-2 pr-4 font-medium text-foreground">{m.categoryName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{accountLabel(m.revenueAccountId)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{accountLabel(m.cogsAccountId)}</td>
                    <td className="py-2 text-muted-foreground">{accountLabel(m.inventoryAccountId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Related configuration">
        <div className="flex flex-col divide-y divide-border">
          {RELATED_LINKS.map((link) => (
            <Link key={link.href} to={link.href} className="group flex items-center justify-between gap-4 py-3 no-underline first:pt-0 last:pb-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground group-hover:text-primary">{link.name}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{link.description}</span>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Not built (the engine has no backing for these, so they are not shown as configurable): document-numbering
        prefixes and sequences, a configurable rounding rule, and a default sales/expense/bank ledger-account map. Each
        document currently generates its own next number, amounts round to two decimals, and posting uses the fixed
        semantic account keys plus the category mappings above.
      </p>
    </div>
  );
}
