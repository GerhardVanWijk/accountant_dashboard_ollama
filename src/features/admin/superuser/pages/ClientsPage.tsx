import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, SearchIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Input } from '@/components/ui/shadcn/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { platformAdminService } from '../services';
import type { PlatformClient } from '../types';
import { ClientStatusBadge, PlanBadge, SubscriptionStatusBadge } from '../components/PlatformBadges';

type Filter = 'all' | 'active' | 'suspended' | 'starter' | 'growth' | 'premium' | 'unmanaged';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'premium', label: 'Premium' },
  { value: 'unmanaged', label: 'Unmanaged' },
];

const ENTITY_LABEL: Record<string, string> = {
  private_company: '(Pty) Ltd',
  public_company: 'Ltd',
  personal_liability_company: 'Inc',
  state_owned_company: 'SOC Ltd',
  non_profit_company: 'NPC',
  close_corporation: 'CC',
  sole_proprietor: 'Sole proprietor',
  partnership: 'Partnership',
  trust: 'Trust',
  external_company: 'External company',
  other: 'Other',
};

export function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<PlatformClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    platformAdminService
      .getClients()
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => {
        if (q) {
          const hay = `${c.company.name} ${c.company.tradingName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        switch (filter) {
          case 'active':
            return c.company.isActive;
          case 'suspended':
            return !c.company.isActive;
          case 'unmanaged':
            return c.management === 'unmanaged';
          case 'starter':
          case 'growth':
          case 'premium':
            return c.planCode === filter;
          default:
            return true;
        }
      })
      .sort((a, b) => a.company.name.localeCompare(b.company.name));
  }, [clients, search, filter]);

  return (
    <>
      <PageHeader title="Clients" description="Every company using Vertex, its plan, access status and team size." />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name or trading name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <ToggleGroup
          value={[filter]}
          onValueChange={(v) => v[0] && setFilter(v[0] as Filter)}
          variant="outline"
          spacing={0}
          aria-label="Filter clients"
          className="flex-wrap"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="h-8 px-2.5 text-xs">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <SectionCard bodyClassName="p-0">
        {!clients && !error ? (
          <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading clients…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <Th>Company</Th>
                  <Th className="hidden md:table-cell">Type</Th>
                  <Th>Plan</Th>
                  <Th className="hidden sm:table-cell">Subscription</Th>
                  <Th className="hidden lg:table-cell text-right">Users</Th>
                  <Th className="hidden lg:table-cell">Created</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.company.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    onClick={() => navigate(`/admin/superuser/clients/${c.company.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{c.company.name}</span>
                        {c.company.tradingName && c.company.tradingName !== c.company.name && (
                          <span className="text-xs text-muted-foreground">t/a {c.company.tradingName}</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                      {ENTITY_LABEL[c.company.legalEntityType] ?? c.company.legalEntityType}
                    </td>
                    <td className="px-4 py-2.5">
                      <PlanBadge planCode={c.planCode} />
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <SubscriptionStatusBadge status={c.subscription?.status ?? null} />
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums lg:table-cell">{c.userCount}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                      {new Date(c.company.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <ClientStatusBadge active={c.company.isActive} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No clients match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground ${className ?? ''}`}>{children}</th>;
}
