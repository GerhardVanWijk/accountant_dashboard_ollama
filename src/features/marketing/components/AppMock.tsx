import { ArrowUpRightIcon, BanknoteIcon, FileTextIcon, LayoutDashboardIcon, ReceiptIcon, SettingsIcon, UsersIcon } from 'lucide-react';

/** Ported verbatim from accounting-v0-frontend/components/landing/app-mock.tsx — no Next-specific APIs, no changes needed. */
const navItems = [
  { icon: LayoutDashboardIcon, label: 'Dashboard', active: true },
  { icon: FileTextIcon, label: 'Invoices', active: false },
  { icon: BanknoteIcon, label: 'Banking', active: false },
  { icon: ReceiptIcon, label: 'Expenses', active: false },
  { icon: UsersIcon, label: 'Contacts', active: false },
  { icon: SettingsIcon, label: 'Settings', active: false },
];

const cashflow = [
  { month: 'Feb', inBar: 52, outBar: 34 },
  { month: 'Mar', inBar: 61, outBar: 40 },
  { month: 'Apr', inBar: 44, outBar: 38 },
  { month: 'May', inBar: 73, outBar: 45 },
  { month: 'Jun', inBar: 68, outBar: 41 },
  { month: 'Jul', inBar: 88, outBar: 52 },
  { month: 'Aug', inBar: 96, outBar: 58 },
];

const invoices = [
  { ref: 'INV-1042', client: 'Sithole Retail Group', amount: 'R 24 850', status: 'Paid' },
  { ref: 'INV-1041', client: 'Bosman Civils', amount: 'R 112 400', status: 'Overdue' },
  { ref: 'INV-1040', client: 'Naledi Foods', amount: 'R 8 320', status: 'Sent' },
  { ref: 'INV-1039', client: 'Cape Fitters', amount: 'R 46 105', status: 'Paid' },
];

const statusStyles: Record<string, string> = {
  Paid: 'bg-brand-muted text-brand',
  Overdue: 'bg-destructive/15 text-destructive',
  Sent: 'bg-muted text-muted-foreground',
};

/** Decorative product mock, composed entirely from markup — no screenshot needed. */
export function AppMock() {
  return (
    <div aria-hidden="true" className="w-full rounded-2xl border border-border bg-card/60 p-1.5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex h-6 flex-1 items-center rounded-md border border-border/70 bg-background/60 px-2.5">
          <span className="font-mono text-[10px] text-muted-foreground">app.vertexaccounting.co.za/dashboard</span>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-xl border border-border bg-background">
        <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border/70 bg-card/40 p-3 md:flex">
          {navItems.map((item) => (
            <div
              key={item.label}
              className={
                item.active
                  ? 'flex items-center gap-2 rounded-lg bg-brand-muted px-2.5 py-2 text-xs font-medium text-brand'
                  : 'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground'
              }
            >
              <item.icon className="size-3.5" />
              {item.label}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Financial year to date</span>
              <span className="text-xl font-semibold tracking-tight md:text-2xl">R 4 218 640</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-2 py-1 text-[11px] font-medium text-brand">
              <ArrowUpRightIcon className="size-3" />
              18.4% vs last year
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              { label: 'Bank balance', value: 'R 862 410' },
              { label: 'Owed to you', value: 'R 341 220' },
              { label: 'You owe', value: 'R 118 905' },
              { label: 'VAT due 25 Sep', value: 'R 96 480' },
            ].map((tile) => (
              <div key={tile.label} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card/50 p-2.5">
                <span className="text-[10px] text-muted-foreground">{tile.label}</span>
                <span className="text-sm font-medium tracking-tight">{tile.value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-border/70 bg-card/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Cash in vs cash out</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-2 rounded-sm bg-brand" />
                    In
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-2 rounded-sm bg-muted-foreground/40" />
                    Out
                  </span>
                </div>
              </div>
              <div className="flex h-28 items-end gap-2.5">
                {cashflow.map((bar) => (
                  <div key={bar.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-24 w-full items-end justify-center gap-[3px]">
                      <span className="w-1/3 rounded-t-[3px] bg-brand" style={{ height: `${bar.inBar}%` }} />
                      <span className="w-1/3 rounded-t-[3px] bg-muted-foreground/30" style={{ height: `${bar.outBar}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{bar.month}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/50 p-3 lg:w-64">
              <span className="text-xs font-medium">Recent invoices</span>
              <div className="flex flex-col gap-1.5">
                {invoices.map((inv) => (
                  <div key={inv.ref} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[11px] font-medium">{inv.client}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">{inv.ref}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-[11px] tabular-nums">{inv.amount}</span>
                      <span className={`rounded px-1.5 py-px text-[9px] font-medium ${statusStyles[inv.status]}`}>{inv.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
