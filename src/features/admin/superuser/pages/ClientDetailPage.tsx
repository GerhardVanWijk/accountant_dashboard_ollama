import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { EnumSelect } from '@/components/app/combobox';
import { ConfirmDialog } from '@/components/app/form';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { FormShell, FormHeader, FormBody, FormFooter } from '@/components/app/form';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { ENTITLEMENT_LABELS, ENTITLEMENT_KEYS, PLAN_BY_CODE, formatZarFromCents, type EntitlementKey } from '@/features/subscriptions/entitlements';
import { platformAdminService } from '../services';
import type { PlatformClientDetail } from '../types';
import {
  ClientStatusBadge,
  ManagementBadge,
  PlanBadge,
  SubscriptionStatusBadge,
} from '../components/PlatformBadges';

const PROFILE_ROLE_OPTIONS = (['viewer', 'operator', 'accountant', 'manager', 'admin'] as const).map((r) => ({
  value: r,
  label: r.charAt(0).toUpperCase() + r.slice(1),
}));

const ENTITY_LABEL: Record<string, string> = {
  private_company: 'Private company (Pty) Ltd',
  public_company: 'Public company Ltd',
  personal_liability_company: 'Personal liability company Inc',
  state_owned_company: 'State-owned company SOC Ltd',
  non_profit_company: 'Non-profit company NPC',
  close_corporation: 'Close corporation CC',
  sole_proprietor: 'Sole proprietor',
  partnership: 'Partnership',
  trust: 'Trust',
  external_company: 'External company',
  other: 'Other',
};

export function ClientDetailPage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PlatformClientDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

  const reload = useCallback(() => {
    setError(null);
    platformAdminService
      .getClientDetail(companyId)
      .then((d) => (d ? setDetail(d) : setNotFound(true)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [companyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (notFound) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/admin/superuser/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Clients
        </Link>
        <p className="text-sm text-muted-foreground">That client no longer exists.</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading client…</p>
      </div>
    );
  }

  const { company } = detail;

  return (
    <>
      <Link to="/admin/superuser/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <PageHeader
        title={company.name}
        description={ENTITY_LABEL[company.legalEntityType] ?? company.legalEntityType}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PlanBadge planCode={detail.planCode} />
            <ClientStatusBadge active={company.isActive} />
          </div>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setTab('subscription')}>
          Manage subscription
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTab('security')}>
          <ShieldAlert data-icon="inline-start" />
          View security audit
        </Button>
        <div className="ml-auto">
          <SuspendControl detail={detail} onDone={reload} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="platform">Platform info</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab detail={detail} />
        </TabsContent>
        <TabsContent value="subscription" className="pt-4">
          <SubscriptionTab detail={detail} onDone={reload} />
        </TabsContent>
        <TabsContent value="users" className="pt-4">
          <UsersTab detail={detail} onDone={reload} />
        </TabsContent>
        <TabsContent value="invitations" className="pt-4">
          <InvitationsTab detail={detail} onDone={reload} />
        </TabsContent>
        <TabsContent value="security" className="pt-4">
          <SecurityTab companyId={company.id} />
        </TabsContent>
        <TabsContent value="platform" className="pt-4">
          <PlatformInfoTab detail={detail} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        This is platform administration. Customer accounting data — balances, invoices, journals, payroll and tax — is
        never shown here.{' '}
        <button type="button" onClick={() => navigate(0)} className="underline">
          Refresh
        </button>
      </p>
    </>
  );
}

// ─── Suspend / reactivate ──────────────────────────────────────────────

function SuspendControl({ detail, onDone }: { detail: PlatformClientDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = detail.company.isActive;

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      if (active) await platformAdminService.suspendClient(detail.company.id, reason);
      else await platformAdminService.reactivateClient(detail.company.id);
      setOpen(false);
      setReason('');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size="sm" variant={active ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        {active ? 'Suspend access' : 'Reactivate'}
      </Button>
      {open && active && (
        <FormShell open onClose={() => setOpen(false)} size="sm" mode="edit" isDirty={Boolean(reason)}>
          <FormHeader title={`Suspend ${detail.company.name}?`} />
          <FormBody>
            <p className="text-sm text-muted-foreground text-pretty">
              Suspending this client blocks its users from the Vertex workspace. Accounting records, users and
              subscriptions are preserved — nothing is deleted. Any Paystack subscription is not affected.
            </p>
            <Field>
              <FieldLabel htmlFor="suspend-reason">Reason (recorded in the audit trail)</FieldLabel>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. non-payment, support request, abuse investigation"
                rows={3}
              />
            </Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </FormBody>
          <FormFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void run()}>
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Suspend client
            </Button>
          </FormFooter>
        </FormShell>
      )}
      <ConfirmDialog
        open={open && !active}
        onOpenChange={setOpen}
        title={`Reactivate ${detail.company.name}?`}
        description="Members will be able to sign in to the workspace again."
        confirmLabel="Reactivate"
        pending={pending}
        error={error}
        onConfirm={() => void run()}
      />
    </>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────

function OverviewTab({ detail }: { detail: PlatformClientDetail }) {
  const { company, setup } = detail;
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(company.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Company information">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <Row label="Legal name" value={company.name} />
          <Row label="Trading name" value={company.tradingName ?? '—'} />
          <Row label="Type" value={ENTITY_LABEL[company.legalEntityType] ?? company.legalEntityType} />
          <Row label="Registration no." value={company.registrationNumber ?? '—'} />
          <Row
            label="VAT"
            value={company.isVatRegistered ? `Registered${company.vatRegistrationNumber ? ` · ${company.vatRegistrationNumber}` : ''}` : 'Not registered'}
          />
          <Row label="Created" value={new Date(company.createdAt).toLocaleDateString()} />
          <div className="text-muted-foreground">Company ID</div>
          <div className="flex items-center gap-2">
            <code className="truncate text-xs">{company.id}</code>
            <button type="button" onClick={() => void copyId()} className="text-muted-foreground hover:text-foreground" aria-label="Copy company ID">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Account setup" description="Configuration health — not financial balances.">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
          <Row
            label="Accounting setup"
            value={<Badge className={setup.bootstrapComplete ? 'bg-status-positive-muted text-status-positive' : 'bg-status-warning-muted text-status-warning'}>{setup.bootstrapComplete ? 'Complete' : 'Incomplete'}</Badge>}
          />
          <Row label="Chart of accounts" value={setup.accountCount > 0 ? `${setup.accountCount} accounts` : 'Not configured'} />
          <Row label="Financial year" value={setup.financialYearConfigured ? 'Configured' : 'Not configured'} />
          <Row label="Accounting periods" value={String(setup.periodCount)} />
          <Row label="Company administrator" value={setup.hasActiveAdmin ? 'Present' : <span className="text-status-negative">None active</span>} />
        </dl>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}

// ─── Subscription tab ──────────────────────────────────────────────────

function SubscriptionTab({ detail, onDone }: { detail: PlatformClientDetail; onDone: () => void }) {
  const { subscription, plan, planCode, management, entitlements } = detail;
  const held = new Set(entitlements);
  const nonCore = ENTITLEMENT_KEYS.filter((k) => !['dashboard', 'customers', 'suppliers', 'user_management', 'settings'].includes(k));

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Current subscription"
        actions={<ManagementBadge management={management} />}
      >
        {subscription ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
            <Row label="Plan" value={<PlanBadge planCode={planCode} />} />
            <Row label="Status" value={<SubscriptionStatusBadge status={subscription.status} />} />
            <Row label="Price" value={plan ? `${formatZarFromCents(plan.priceCents)} / month ex VAT · ${plan.includedUsers} user(s)` : '—'} />
            <Row label="Period" value={subscription.currentPeriodStart ? `${subscription.currentPeriodStart} → ${subscription.currentPeriodEnd ?? '—'}` : '—'} />
            <Row label="Provider" value={subscription.provider ?? 'None'} />
            <Row label="Provider reference" value={subscription.providerReference ?? '—'} />
            <Row label="Created" value={new Date(subscription.createdAt).toLocaleString()} />
            <Row label="Updated" value={new Date(subscription.updatedAt).toLocaleString()} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground text-pretty">
            This client has <strong>no subscription row</strong> — it is <strong>unmanaged</strong> and has full module
            access (grandfathered). Assign a plan below to bring it under management.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Included modules">
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {nonCore.map((key) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              {held.has(key) ? (
                <Check className="size-4 shrink-0 text-status-positive" />
              ) : (
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={held.has(key) ? 'text-foreground' : 'text-muted-foreground'}>
                {ENTITLEMENT_LABELS[key as EntitlementKey]}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Dashboard, Customers, Suppliers, Users &amp; access and Settings are always included on every plan.
        </p>
      </SectionCard>

      <PlanOverridePanel detail={detail} onDone={onDone} />
    </div>
  );
}

function featuresFor(code: string | null): Set<string> {
  if (!code) return new Set(ENTITLEMENT_KEYS);
  const plan = PLAN_BY_CODE.get(code as 'starter' | 'growth' | 'premium');
  return new Set(['dashboard', 'customers', 'suppliers', 'user_management', 'settings', ...(plan?.features ?? [])]);
}

function PlanOverridePanel({ detail, onDone }: { detail: PlatformClientDetail; onDone: () => void }) {
  const [target, setTarget] = useState(detail.planCode ?? 'starter');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = detail.planCode;
  const currentFeatures = featuresFor(current);
  const nextFeatures = featuresFor(target);
  const added = [...nextFeatures].filter((f) => !currentFeatures.has(f));
  const removed = [...currentFeatures].filter((f) => !nextFeatures.has(f));

  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      await platformAdminService.setSubscriptionPlan(detail.company.id, target);
      setConfirm(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const statusAction = async (status: string) => {
    setPending(true);
    setError(null);
    try {
      await platformAdminService.setSubscriptionStatus(detail.company.id, status);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title="Manual / superuser override"
      description="An audited platform action. Historical accounting information is never deleted on a downgrade."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-48">
            <FieldLabel htmlFor="plan-select">Plan</FieldLabel>
            <EnumSelect
              id="plan-select"
              value={target}
              onValueChange={setTarget}
              options={[
                { value: 'starter', label: 'Starter' },
                { value: 'growth', label: 'Growth' },
                { value: 'premium', label: 'Premium' },
              ]}
            />
          </Field>
          <Button size="sm" disabled={pending || target === current} onClick={() => setConfirm(true)}>
            {detail.subscription ? 'Change plan' : 'Assign plan'}
          </Button>
        </div>

        {detail.subscription && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Subscription status:</span>
            {detail.subscription.status !== 'suspended' ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void statusAction('suspended')}>
                Suspend subscription
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void statusAction('active')}>
                Reactivate subscription
              </Button>
            )}
            {detail.subscription.status !== 'cancelled' && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => void statusAction('cancelled')}>
                Cancel subscription
              </Button>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>

      {confirm && (
        <FormShell open onClose={() => setConfirm(false)} size="sm" mode="edit" isDirty>
          <FormHeader title="Confirm subscription change" />
          <FormBody>
            <p className="text-sm text-pretty">
              Changing this subscription changes which Vertex modules this company can access. Historical accounting
              information will not be deleted.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <PlanBadge planCode={current} /> <span className="text-muted-foreground">→</span> <PlanBadge planCode={target} />
              <Badge className="bg-status-warning-muted text-status-warning">Manual / superuser override</Badge>
            </div>
            {added.length > 0 && (
              <div>
                <p className="text-xs font-medium text-status-positive">Modules being added</p>
                <p className="text-sm text-muted-foreground">{added.map((f) => ENTITLEMENT_LABELS[f as EntitlementKey] ?? f).join(', ')}</p>
              </div>
            )}
            {removed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-status-negative">Modules becoming unavailable</p>
                <p className="text-sm text-muted-foreground">{removed.map((f) => ENTITLEMENT_LABELS[f as EntitlementKey] ?? f).join(', ')}</p>
                <p className="mt-1 text-xs text-muted-foreground">Data in these modules is retained and becomes visible again if the plan is restored.</p>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </FormBody>
          <FormFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={() => void apply()}>
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Confirm change
            </Button>
          </FormFooter>
        </FormShell>
      )}
    </SectionCard>
  );
}

// ─── Users tab ─────────────────────────────────────────────────────────

function UsersTab({ detail, onDone }: { detail: PlatformClientDetail; onDone: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<{ userId: string; roleId: string }[]>([]);

  useEffect(() => {
    Promise.all([
      platformAdminService.getSystemRoles(),
      platformAdminService.getUserRoleAssignments(detail.company.id),
    ])
      .then(([r, a]) => {
        setRoles(r);
        setAssignments(a);
      })
      .catch(() => {});
  }, [detail.company.id]);

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Everyone with access to this client&rsquo;s workspace.</p>
        <AddMemberDialog companyId={detail.company.id} roles={roles} onDone={onDone} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <SectionCard bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">User</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Access level</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">Roles</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Last sign-in</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {detail.members.map((m) => {
                const mine = assignments.filter((a) => a.userId === m.id);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {[m.firstName, m.lastName].filter(Boolean).join(' ') || '—'}
                        </span>
                        <span className="text-xs text-muted-foreground">{m.email ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <EnumSelect
                        className="capitalize"
                        value={m.profileRole}
                        disabled={busyId === m.id || m.profileRole === 'superuser'}
                        aria-label={`Access level for ${m.email ?? m.id}`}
                        onValueChange={(v) => void act(m.id, () => platformAdminService.setMemberAccess(m.id, { profileRole: v }))}
                        options={PROFILE_ROLE_OPTIONS}
                      />
                    </td>
                    <td className="hidden px-4 py-2.5 lg:table-cell">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mine.map((a) => (
                          <Badge key={a.roleId} variant="outline" className="gap-1">
                            {rolesById.get(a.roleId) ?? a.roleId}
                            <button
                              type="button"
                              aria-label="Remove role"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void act(m.id, async () => {
                                await platformAdminService.unassignRole(m.id, a.roleId);
                                setAssignments((prev) => prev.filter((x) => !(x.userId === m.id && x.roleId === a.roleId)));
                              })}
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                        <AssignRoleInline
                          roles={roles.filter((r) => !mine.some((a) => a.roleId === r.id))}
                          onAssign={(roleId) => void act(m.id, async () => {
                            await platformAdminService.assignRole(m.id, roleId);
                            setAssignments((prev) => [...prev, { userId: m.id, roleId }]);
                          })}
                        />
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {m.lastSignInAt ? new Date(m.lastSignInAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={m.isActive ? 'bg-status-positive-muted text-status-positive' : 'bg-status-negative-muted text-status-negative'}>
                        {m.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {m.profileRole !== 'superuser' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === m.id}
                            onClick={() => void act(m.id, () => platformAdminService.setMemberAccess(m.id, { isActive: !m.isActive }))}
                          >
                            {m.isActive ? 'Suspend' : 'Reactivate'}
                          </Button>
                          <RemoveMemberButton
                            name={m.email ?? m.id}
                            disabled={busyId === m.id}
                            onConfirm={() => void act(m.id, () => platformAdminService.removeMember(m.id))}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {detail.members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function AssignRoleInline({ roles, onAssign }: { roles: { id: string; name: string }[]; onAssign: (roleId: string) => void }) {
  const [value, setValue] = useState('');
  if (roles.length === 0) return null;
  return (
    <EnumSelect
      className="h-7 w-36 text-xs"
      value={value}
      placeholder="+ role"
      onValueChange={(v) => {
        if (v) onAssign(v);
        setValue('');
      }}
      options={[{ value: '', label: '+ role' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
    />
  );
}

function RemoveMemberButton({ name, disabled, onConfirm }: { name: string; disabled?: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={disabled} onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${name} from this company?`}
        description="Their account is kept but detached from the company, and their company roles are removed. They can be re-added later."
        destructive
        confirmLabel="Remove from company"
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}

function AddMemberDialog({ companyId, roles, onDone }: { companyId: string; roles: { id: string; name: string }[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'existing' | 'invite'>('existing');
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<{ id: string; email: string | null; firstName: string | null; lastName: string | null } | null | undefined>(undefined);
  const [inviteRole, setInviteRole] = useState('operator');
  const [inviteFineRole, setInviteFineRole] = useState('');
  const [created, setCreated] = useState<{ acceptPath: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setFound(undefined);
    setCreated(null);
    setError(null);
    setInviteRole('operator');
    setInviteFineRole('');
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      setFound((await platformAdminService.findExistingUser(email)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addExisting = async () => {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      await platformAdminService.addExistingUser(found.id, companyId);
      close();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await platformAdminService.createInvitation(companyId, email, inviteRole, inviteFineRole || undefined);
      setCreated({ acceptPath: `${window.location.origin}${r.acceptPath}`, email: r.email });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.acceptPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add user
      </Button>
      {open && (
        <FormShell open onClose={close} size="sm" mode="create" isDirty={Boolean(email)}>
          <FormHeader title="Add someone to this client" />
          <FormBody>
            {created ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Invitation created for {created.email}</p>
                <p className="text-sm text-muted-foreground text-pretty">
                  Vertex can&rsquo;t send emails yet — copy this secure single-use link and send it to the user. It
                  expires in 7 days and can only be shown once.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{created.acceptPath}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
                    {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ToggleGroup
                  value={[mode]}
                  onValueChange={(v) => {
                    if (v[0] === 'existing' || v[0] === 'invite') {
                      setMode(v[0]);
                      setError(null);
                      setFound(undefined);
                    }
                  }}
                  variant="outline"
                  spacing={0}
                  aria-label="How to add this person"
                >
                  <ToggleGroupItem value="existing" className="h-9 flex-1 px-3 text-sm">
                    Existing Vertex user
                  </ToggleGroupItem>
                  <ToggleGroupItem value="invite" className="h-9 flex-1 px-3 text-sm">
                    Invite new user
                  </ToggleGroupItem>
                </ToggleGroup>

                <Field>
                  <FieldLabel htmlFor="add-email">Email address</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="add-email"
                      type="email"
                      value={email}
                      placeholder="colleague@example.com"
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFound(undefined);
                      }}
                    />
                    {mode === 'existing' && (
                      <Button type="button" variant="outline" disabled={busy || !email.trim()} onClick={() => void lookup()}>
                        Find
                      </Button>
                    )}
                  </div>
                </Field>

                {mode === 'existing' && found === null && (
                  <p className="text-sm text-muted-foreground">No unassigned Vertex account with that email. Use &ldquo;Invite new user&rdquo;.</p>
                )}
                {mode === 'existing' && found && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                    <span>{[found.firstName, found.lastName].filter(Boolean).join(' ') || found.email}</span>
                    <Button size="sm" disabled={busy} onClick={() => void addExisting()}>
                      Add to company
                    </Button>
                  </div>
                )}

                {mode === 'invite' && (
                  <>
                    <Field>
                      <FieldLabel htmlFor="invite-role">Access level</FieldLabel>
                      <EnumSelect id="invite-role" value={inviteRole} onValueChange={setInviteRole} options={PROFILE_ROLE_OPTIONS} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-fine">Role (optional)</FieldLabel>
                      <EnumSelect
                        id="invite-fine"
                        value={inviteFineRole}
                        onValueChange={setInviteFineRole}
                        placeholder="No specific role"
                        options={[{ value: '', label: 'No specific role' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
                      />
                    </Field>
                    <Button size="sm" className="self-start" disabled={busy || !email.trim()} onClick={() => void invite()}>
                      {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
                      Create invitation
                    </Button>
                  </>
                )}
              </>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </FormBody>
          <FormFooter>
            <Button type="button" variant="outline" onClick={created ? reset : close}>
              {created ? 'Add someone else' : 'Close'}
            </Button>
            {created && (
              <Button type="button" onClick={close}>
                Done
              </Button>
            )}
          </FormFooter>
        </FormShell>
      )}
    </>
  );
}

// ─── Invitations tab ───────────────────────────────────────────────────

function InvitationsTab({ detail, onDone }: { detail: PlatformClientDetail; onDone: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await platformAdminService.revokeInvitation(id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const statusTone: Record<string, string> = {
    pending: 'bg-status-warning-muted text-status-warning',
    accepted: 'bg-status-positive-muted text-status-positive',
    revoked: 'bg-muted text-muted-foreground',
    expired: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <SectionCard bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Access level</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Created</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Expires</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {detail.invitations.map((inv) => {
                const expired = inv.status === 'pending' && new Date(inv.expiresAt) <= new Date();
                const shownStatus = expired ? 'expired' : inv.status;
                return (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium text-foreground">{inv.email}</td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{inv.profileRole}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={statusTone[shownStatus] ?? 'bg-muted text-muted-foreground'}>{shownStatus}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {inv.status === 'pending' && !expired && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busyId === inv.id} onClick={() => void revoke(inv.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {detail.invitations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No invitations. Use the Users tab to invite someone.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <p className="text-xs text-muted-foreground">
        An invitation link is single-use and shown only once, at creation — the raw token is never stored, so it can&rsquo;t
        be retrieved later. For an expired invitation, create a new one from the Users tab.
      </p>
    </div>
  );
}

// ─── Security tab ──────────────────────────────────────────────────────

function SecurityTab({ companyId }: { companyId: string }) {
  const [events, setEvents] = useState<import('../types').PlatformAuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformAdminService
      .getAuditEvents(200, companyId)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [companyId]);

  return (
    <SectionCard title="Security & administrative events" bodyClassName="p-0">
      {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
      {!events && !error ? (
        <div role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading events…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Actor</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground md:table-cell">Target</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.actorEmail ?? e.actorId.slice(0, 8)}</td>
                  <td className="px-4 py-2.5">{e.action.replace(/_/g, ' ')}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{e.recordType}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">{e.reason ?? '—'}</td>
                </tr>
              ))}
              {(events ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No administrative events recorded for this client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Platform info tab ─────────────────────────────────────────────────

function PlatformInfoTab({ detail }: { detail: PlatformClientDetail }) {
  const { company } = detail;
  return (
    <SectionCard title="Platform metadata">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
        <Row label="Company ID" value={<code className="text-xs">{company.id}</code>} />
        <Row label="Created" value={new Date(company.createdAt).toLocaleString()} />
        <Row label="Last updated" value={new Date(company.updatedAt).toLocaleString()} />
        <Row label="Functional currency" value={company.functionalCurrency} />
        <Row label="Financial year-end" value={`${String(company.financialYearEndDay).padStart(2, '0')}/${String(company.financialYearEndMonth).padStart(2, '0')}`} />
        <Row label="Members" value={String(detail.setup.memberCount ?? detail.members.length)} />
        <Row label="Access status" value={<ClientStatusBadge active={company.isActive} />} />
        {!company.isActive && company.suspensionReason && <Row label="Suspension reason" value={company.suspensionReason} />}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        Infrastructure usage (storage, bandwidth, database) is managed through the hosting provider dashboards and is not
        surfaced here.
      </p>
    </SectionCard>
  );
}
