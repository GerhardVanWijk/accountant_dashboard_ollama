import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import type { CompanyInvitation } from '@/types';
import { platformAdminService } from '../services';

type Filter = 'pending' | 'accepted' | 'revoked' | 'expired' | 'all';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-status-warning-muted text-status-warning',
  accepted: 'bg-status-positive-muted text-status-positive',
  revoked: 'bg-muted text-muted-foreground',
  expired: 'bg-muted text-muted-foreground',
};

export function PlatformInvitationsPage() {
  const [invitations, setInvitations] = useState<CompanyInvitation[] | null>(null);
  const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    Promise.all([platformAdminService.getAllInvitations(), platformAdminService.getClients()])
      .then(([inv, clients]) => {
        setInvitations(inv);
        setCompanyNames(new Map(clients.map((c) => [c.company.id, c.company.name])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, []);

  const rows = useMemo(() => {
    if (!invitations) return [];
    return invitations
      .map((inv) => ({
        inv,
        effectiveStatus:
          inv.status === 'pending' && new Date(inv.expiresAt) <= new Date() ? 'expired' : inv.status,
      }))
      .filter((r) => filter === 'all' || r.effectiveStatus === filter)
      .sort((a, b) => new Date(b.inv.createdAt).getTime() - new Date(a.inv.createdAt).getTime());
  }, [invitations, filter]);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await platformAdminService.revokeInvitation(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Invitations"
        description="Every company invitation across the platform. Links are single-use and shown only once at creation."
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} variant="outline" spacing={0} aria-label="Filter">
        {(['pending', 'accepted', 'expired', 'revoked', 'all'] as Filter[]).map((f) => (
          <ToggleGroupItem key={f} value={f} className="h-8 px-3 text-xs capitalize">
            {f}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <SectionCard bodyClassName="p-0">
        {!invitations && !error ? (
          <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading invitations…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Access level</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Created</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Expires</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, effectiveStatus }) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium text-foreground">{inv.email}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/superuser/clients/${inv.companyId}`} className="text-muted-foreground hover:underline">
                        {companyNames.get(inv.companyId) ?? inv.companyId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{inv.profileRole}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={STATUS_TONE[effectiveStatus] ?? 'bg-muted text-muted-foreground'}>{effectiveStatus}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {effectiveStatus === 'pending' && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busyId === inv.id} onClick={() => void revoke(inv.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No invitations in this view.
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
