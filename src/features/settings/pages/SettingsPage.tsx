import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Loader2, ShieldCheck } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Avatar, AvatarFallback } from '@/components/ui/shadcn/avatar';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';
import { profileService } from '@/features/auth/services';
import { useCompany } from '@/features/admin/hooks/useCompany';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function initials(firstName?: string, lastName?: string, email?: string): string {
  const value = [firstName?.[0], lastName?.[0]].filter(Boolean).join('');
  return value || (email?.[0]?.toUpperCase() ?? '?');
}

/**
 * Your profile — real `profileService.updateOwnProfile()` (first/last name
 * only; there is no email-change capability anywhere in
 * IProfileRepository, and no avatar/photo storage exists, so neither is
 * offered here — v0's own Settings mock has both). Role is shown read-only:
 * it's changed by a company admin on the Users page, not self-service.
 */
function ProfileTab() {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      await profileService.updateOwnProfile(profile.id, { firstName: firstName || undefined, lastName: lastName || undefined });
      const refreshed = await profileService.getById(profile.id);
      if (refreshed) setProfile(refreshed);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Your profile" description="How you appear to other users in this workspace.">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-14">
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials(profile.firstName, profile.lastName, profile.email)}</AvatarFallback>
            </Avatar>
            <p className="text-xs text-muted-foreground">Photo upload isn't available yet — this app has no file storage set up.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-first-name">First name</FieldLabel>
              <Input id="profile-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-last-name">Last name</FieldLabel>
              <Input id="profile-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-role">Access level</FieldLabel>
              <Input id="profile-role" value={profile.role} disabled />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
              <Input id="profile-email" type="email" value={profile.email ?? ''} disabled />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-muted-foreground">Saved</span>}
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

/** Real Supabase Auth password update — `supabase.auth.updateUser({ password })`, the same call ResetPasswordPage (M6) uses against an active session. No "current password" field: Supabase doesn't require re-entering it for an already-signed-in session, and showing one that isn't actually checked would be misleading. */
function PasswordTab() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setError(authError.message);
        return;
      }
      setPassword('');
      setConfirm('');
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Password" description="Change the password used to sign in.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-muted-foreground">Password updated</span>}
        <Button size="sm" disabled={saving || !password} onClick={() => void save()}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          Update password
        </Button>
      </div>
    </SectionCard>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
];

/** The one real, persisted preference this app has: theme (`useThemeStore`, localStorage). v0's "Compact tables"/"Week starts Monday" switches have no backing persistence anywhere and are not built here. */
function PreferencesTab() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <SectionCard title="Display" description="How the workspace looks on this device.">
      <Field className="max-w-xs">
        <FieldLabel htmlFor="theme-preference">Theme</FieldLabel>
        <select id="theme-preference" className={selectClassName} value={theme} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </SectionCard>
  );
}

/** Summary only — the real CompanyForm (M2) at /companies owns editing, so it isn't duplicated here. `setReportingFramework()`/`setSbcEligibility()`'s mandatory-reason audit path is untouched: this tab has no controls of its own that could bypass it. */
function CompanyTab() {
  const { company, loading } = useCompany();

  if (loading) {
    return (
      <div role="status" className="flex min-h-[20vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading company…</p>
      </div>
    );
  }

  if (!company) {
    return (
      <SectionCard>
        <p className="text-sm text-muted-foreground">No company set up yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={company.name}
      description="Used on invoices, statements and statutory filings."
      actions={
        <Button variant="outline" size="sm" render={<Link to="/companies" />}>
          Manage company details
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Registration number</span>
          <span className="text-sm">{company.registrationNumber ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Legal entity type</span>
          <span className="text-sm">{company.legalEntityType.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reporting framework</span>
          <span className="text-sm">{company.reportingFramework === 'not_yet_determined' ? 'Not yet determined' : company.reportingFramework.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">SBC eligible</span>
          <span className="text-sm">{company.isSbcEligible === undefined ? 'Not set' : company.isSbcEligible ? 'Yes' : 'No'}</span>
        </div>
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Reporting framework and SBC eligibility can only be changed on the Companies page, and always require a recorded reason — they're audited overrides, not a plain field edit.
      </p>
    </SectionCard>
  );
}

/**
 * Settings Centre — route `/settings`. Only exposes functionality this app
 * genuinely has: real profile fields, a real Supabase password change, the
 * one real persisted preference (theme), and a company summary that links
 * to the existing CompanyForm rather than duplicating it. v0's Security,
 * Notifications-preferences and avatar-upload tabs have no backing
 * persistence anywhere in this app and are intentionally not built — see
 * the M10 report for the full gap list. Accounting configuration lives on
 * its own page (`/settings/accounting`), matching v0's own two-page
 * structure.
 */
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, password, display preferences and this company's details."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/settings/accounting" />}>
            Accounting settings
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="pt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="password" className="pt-6">
          <PasswordTab />
        </TabsContent>
        <TabsContent value="preferences" className="pt-6">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="company" className="pt-6">
          <CompanyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
