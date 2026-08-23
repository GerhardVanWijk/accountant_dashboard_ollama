import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogAccessEntry, Company, Profile, ProfileRole } from '@/types';
import { companyService } from '@/features/admin/services';
import { profileService, auditLogAccessService } from '@/features/auth/services';

const PROFILE_ROLES: ProfileRole[] = ['admin', 'accountant', 'manager', 'operator', 'viewer'];

const inputClasses =
  'rounded-md border border-border bg-background px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
    <div className="flex flex-col gap-lg">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{company.name}</h2>
            <p className="text-sm text-text-secondary">
              {company.legalEntityType} · {company.subscriptionTier ?? 'free'} tier
            </p>
          </div>
          <Button variant="danger" disabled={busyId === '__bulk__' || users.every((u) => !u.isActive)} onClick={suspendAll}>
            Suspend all users
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary">Users</h3>
        <p className="mt-xs text-sm text-text-secondary">
          No financial data (invoices, GL, customers) is visible here — support access only.
        </p>
        {loading ? (
          <p className="mt-md text-sm text-text-secondary">Loading…</p>
        ) : (
          <div className="mt-md overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="py-xs pr-md font-medium">Email</th>
                  <th className="py-xs pr-md font-medium">Access level</th>
                  <th className="py-xs pr-md font-medium">Status</th>
                  <th className="py-xs pr-md font-medium" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="py-sm pr-md text-text-primary">{user.email ?? '—'}</td>
                    <td className="py-sm pr-md">
                      <select
                        className={inputClasses}
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(e) => changeRole(user.id, e.target.value as ProfileRole)}
                      >
                        {PROFILE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-sm pr-md">
                      <span className={user.isActive ? 'text-positive' : 'text-danger'}>
                        {user.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-sm pr-md">
                      <Button variant="ghost" disabled={busyId === user.id} onClick={() => toggleActive(user)}>
                        {user.isActive ? 'Suspend' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-md text-center text-text-secondary">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary">Audit logs</h3>
        <div className="mt-md overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="py-xs pr-md font-medium">When</th>
                <th className="py-xs pr-md font-medium">Action</th>
                <th className="py-xs pr-md font-medium">Table</th>
                <th className="py-xs pr-md font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="py-sm pr-md text-text-secondary">{new Date(entry.occurredAt).toLocaleString()}</td>
                  <td className="py-sm pr-md text-text-primary">{entry.action}</td>
                  <td className="py-sm pr-md text-text-primary">{entry.tableName}</td>
                  <td className="py-sm pr-md">
                    <span className={entry.result === 'allowed' ? 'text-positive' : 'text-danger'}>{entry.result}</span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-md text-center text-text-secondary">
                    No access log entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary">Usage</h3>
        <p className="mt-xs text-sm text-text-secondary">
          Storage/egress/API-call metering is platform-level Supabase data this app has no access to (no MCP tool or
          client API exposes it) — deliberately not fabricated. Real, derivable numbers only:
        </p>
        <p className="mt-sm text-sm text-text-primary">{users.length} user(s) provisioned.</p>
      </Card>
    </div>
  );
}

/**
 * Superuser Dashboard (Phase T). Placed under src/features/admin/pages/
 * rather than the brief's literal src/pages/admin/ — this codebase has no
 * src/pages/ directory anywhere; every page lives under a feature folder
 * (docs/ARCHITECTURE.md), and admin-owned pages already live in
 * src/features/admin/pages/ (UsersPage.tsx, AuditPage.tsx). Deliberately
 * self-contained: does NOT reuse AppLayout/Topbar/navigation.ts — those are
 * the tenant-facing accounting nav, irrelevant and actively misleading for
 * an account with no company and no access to any of it.
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
    <div className="flex min-h-screen bg-background text-text-primary">
      <aside className="w-72 shrink-0 border-r border-border p-md">
        <div className="flex items-start justify-between gap-sm">
          <h1 className="text-lg font-semibold">Superuser</h1>
          <Button variant="ghost" onClick={logout} className="shrink-0">
            <Icon name="logout" size={16} />
            Sign out
          </Button>
        </div>
        <p className="mt-xs text-sm text-text-secondary">All tenants — no financial data access.</p>
        <input
          type="search"
          placeholder="Search companies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClasses} mt-md w-full`}
        />
        {loading ? (
          <p className="mt-md text-sm text-text-secondary">Loading…</p>
        ) : (
          <ul className="mt-md flex flex-col gap-xs">
            {filtered.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  onClick={() => setSelected(company)}
                  className={`w-full rounded-md px-sm py-sm text-left text-sm ${
                    selected?.id === company.id ? 'bg-primary text-on-accent' : 'hover:bg-panel'
                  }`}
                >
                  {company.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-sm text-text-secondary">No companies found.</li>}
          </ul>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-lg">
        {selected ? (
          <TenantDetail company={selected} actorId={actorId} />
        ) : (
          <p className="text-sm text-text-secondary">Select a company from the list.</p>
        )}
      </main>
    </div>
  );
}
