import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';

interface ConfigLink {
  href: string;
  name: string;
  description: string;
}

/**
 * Every real, already-implemented piece of accounting configuration this
 * app has — a navigation hub, not a form. v0's Accounting Settings mockup
 * shows editable numbering prefixes, a rounding rule, a VAT basis toggle
 * and default-account mappings; none of those are backed by any real
 * service/table (confirmed by inspection — invoice/bill/journal numbers
 * are generated per-document, not from a stored prefix setting, and there
 * is no default-account-mapping table), so none are fabricated here (M10).
 */
const CONFIG_LINKS: ConfigLink[] = [
  { href: '/financial-periods', name: 'Financial periods', description: 'Open, soft-close and close accounting periods for the current financial year.' },
  { href: '/tax/rates', name: 'Tax rates', description: 'VAT and other tax rates available when capturing transactions, including superseding an existing rate.' },
  { href: '/tax/vat-return', name: 'VAT', description: 'Output/input VAT for real posted documents this period.' },
  { href: '/accounting/coa', name: 'Chart of accounts', description: 'The ledger accounts every transaction posts against.' },
];

/**
 * Accounting Settings — route `/settings/accounting`. Purely a link hub
 * onto the real, already-implemented configuration pages, matching v0's
 * own two-page Settings structure (a dedicated page linked from the
 * Settings hub) without duplicating any of those pages' forms.
 */
export function AccountingSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounting settings"
        description="Financial periods, tax rates and the chart of accounts for this company."
        actions={
          <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Settings
          </Link>
        }
      />

      <SectionCard>
        <div className="flex flex-col divide-y divide-border">
          {CONFIG_LINKS.map((link) => (
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
        Not built (no backend exists yet): document-numbering prefixes, rounding rules, default sales/expense/bank ledger accounts, and a VAT-basis (invoice vs. payment) toggle — each document currently generates its own next number, and there is no default-account-mapping table to configure.
      </p>
    </div>
  );
}
