import { useEffect, useState, useCallback } from 'react';
import { Loader2, LogOutIcon, SearchIcon } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogAccessEntry, Company, Profile, ProfileRole } from '@/types';
import { companyService } from '@/features/admin/services';
import { profileService, auditLogAccessService } from '@/features/auth/services';

const PROFILE_ROLES: ProfileRole[] = ['admin', 'accountant', 'manager', 'operator', 'viewer'];

const selectClassName =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function TenantDetail({ company, actorId }: { company: Company; actorId: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<AuditLogAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([profileService.getByCompany(company.id), auditLogAccessService.getByCompany(company.id, 100)])
      .then(([u, l]) => {
        setUsers(u);
        setLogs(l);
      })
      .finally(() => setLoading(false));
  }, [company.id]);

  useEffect(() => {
    reload();
    // Best-effort access log: a superuser opening a tenant's detail is exactly
    // the kind of event the audit trail exists to surface — written into
    // THAT company's own audit_logs_access, visible to its admin too.
    auditLogAccessService.log({
      actorId,
      action: 'viewed_tenant_detail',
      tableName: 'profiles',
      companyId: company.id,
      result: 'allowed',
    });
  }, [company.id, actorId, reload]);

  const changeRole = async (userId: string, role: ProfileRole) => {
    setBusyId(userId);
    try {
      await profileService.changeRole(actorId, userId, role);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: Profile) => {
    setBusyId(user.id);
    try {
      await profileService.setActive(actorId, user.id, !user.isActive);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const suspendAll = async () => {
    setBusyId('__bulk__');
    try {
      await Promise.all(users.filter((u) => u.isActive).map((u) => profileService.setActive(actorId, u.id, false)));
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{company.name}</h2>
            <p className="text-sm text-muted-foreground">
              {company.legalEntityType} · {company.subscriptionTier ?? 'free'} tier
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={busyId === '__bulk__' || users.every((u) => !u.isActive)}
            onClick={() => void suspendAll()}
          >
            Suspend all users
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Users"
        description="No financial data (invoices, GL, customers) is visible here — support access only."
        bodyClassName="p-0"
      >
        {loading ? (
          <div role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading users…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Access level</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{user.email ?? '—'}</td>
                    <td className="px-4 py-2">
                      <select
                        className={selectClassName}
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(e) => void changeRole(user.id, e.target.value as ProfileRole)}
                      >
                        {PROFILE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={user.isActive ? 'active' : 'suspended'} />
                    </td>
                    <td className="px-4 py-2">
                      <Button variant="ghost" size="sm" disabled={busyId === user.id} onClick={() => void toggleActive(user)}>
                        {user.isActive ? 'Suspend' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Audit logs" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">When</th>
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Table</th>
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{entry.action}</td>
                  <td className="px-4 py-2">{entry.tableName}</td>
                  <td className="px-4 py-2">
                    <span className={entry.result === 'allowed' ? 'text-status-positive' : 'text-status-negative'}>{entry.result}</span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                    No access log entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Usage">
        <p className="text-sm text-muted-foreground">
          Storage/egress/API-call metering is platform-level Supabase data this app has no access to (no MCP tool or
          client API exposes it) — deliberately not fabricated. Real, derivable numbers only:
        </p>
        <p className="mt-2 text-sm">{users.length} user(s) provisioned.</p>
      </SectionCard>
    </div>
  );
}

/**
 * Superuser Dashboard (Phase T; presentation re-skinned onto v0/shadcn in
 * M14). Placed under src/features/admin/pages/ rather than the brief's
 * literal src/pages/admin/ — this codebase has no src/pages/ directory
 * anywhere; every page lives under a feature folder (docs/ARCHITECTURE.md),
 * and admin-owned pages already live in src/features/admin/pages/
 * (UsersPage.tsx, AuditPage.tsx). Deliberately self-contained: does NOT
 * reuse AppLayout/the sidebar/navigation.ts — those are the tenant-facing
 * accounting nav, irrelevant and actively misleading for an account with no
 * company and no access to any of it. `PageHeader`/`SectionCard` are
 * layout-agnostic (no AppLayout dependency), so this page can use v0's
 * visual language for its own two-pane shell without adopting the tenant
 * app chrome. No behavior/authorization/data-access change from the
 * pre-M14 version — same services, same guards (RouteGuard confines a
 * `role === 'superuser'` profile to exactly this route), same actions.
 */
export function SuperUserDashboardPage() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const logout = useAuthStore((s) => s.logout);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companyService
      .getCompanies()
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  if (!actorId) return null;

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-72 shrink-0 border-r border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold">Superuser</h1>
          <Button variant="ghost" size="sm" onClick={logout} className="shrink-0">
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">All tenants — no financial data access.</p>
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {loading ? (
          <div role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading companies…
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-1">
            {filtered.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  onClick={() => setSelected(company)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === company.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {company.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-sm text-muted-foreground">No companies found.</li>}
          </ul>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <TenantDetail company={selected} actorId={actorId} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a company from the list.</p>
        )}
      </main>
    </div>
  );
}
