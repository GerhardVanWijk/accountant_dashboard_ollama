import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, SearchIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { platformAdminService } from '../services';
import type { PlatformClient, PlatformMember } from '../types';

interface Row {
  member: PlatformMember;
  company: PlatformClient['company'];
}

type Filter = 'all' | 'active' | 'suspended';

/**
 * Platform-wide user directory. Reads each client's members through
 * `platform_admin_company_users()` (superuser-only). Per-user administration
 * happens on the client's own Users tab, where the company context is
 * explicit — this screen is the cross-company lens.
 */
export function PlatformUsersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    (async () => {
      try {
        const clients = await platformAdminService.getClients();
        const lists = await Promise.all(
          clients.map(async (c) => ({
            company: c.company,
            members: await platformAdminService.getCompanyMembers(c.company.id),
          })),
        );
        setRows(lists.flatMap((l) => l.members.map((member) => ({ member, company: l.company }))));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q) {
          const hay = `${r.member.email ?? ''} ${r.member.firstName ?? ''} ${r.member.lastName ?? ''} ${r.company.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === 'active') return r.member.isActive;
        if (filter === 'suspended') return !r.member.isActive;
        return true;
      })
      .sort((a, b) => (a.member.email ?? '').localeCompare(b.member.email ?? ''));
  }, [rows, search, filter]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with access to a Vertex client workspace. Change access on a client's Users tab."
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search name, email or company…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} variant="outline" spacing={0} aria-label="Filter">
          {(['all', 'active', 'suspended'] as Filter[]).map((f) => (
            <ToggleGroupItem key={f} value={f} className="h-8 px-3 text-xs capitalize">
              {f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <SectionCard bodyClassName="p-0">
        {!rows && !error ? (
          <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading users…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Access level</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Last sign-in</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.company.id}:${r.member.id}`} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{[r.member.firstName, r.member.lastName].filter(Boolean).join(' ') || '—'}</span>
                        <span className="text-xs text-muted-foreground">{r.member.email ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/superuser/clients/${r.company.id}`} className="text-muted-foreground hover:underline">
                        {r.company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{r.member.profileRole}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {r.member.lastSignInAt ? new Date(r.member.lastSignInAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={r.member.isActive ? 'bg-status-positive-muted text-status-positive' : 'bg-status-negative-muted text-status-negative'}>
                        {r.member.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No users match.
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
