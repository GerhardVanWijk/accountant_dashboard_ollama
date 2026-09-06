import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { Seo } from '@/lib/seo/Seo';
import { useAuthStore } from '@/stores/authStore';
import { invitationService } from '@/features/invitations/services';
import { AuthShell } from '../components/AuthShell';
import { profileService } from '../services';

/**
 * `/accept-invite?token=…` — Flow B landing. Works signed-out (prompts the
 * recipient to sign up / sign in with the invited email, stashing the
 * token) and signed-in (a companyless user accepts). The token is
 * company- and email-bound and single-use server-side
 * (`accept_company_invitation`, migration 0069).
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      try {
        window.localStorage.setItem('vertex_pending_invite', token);
      } catch {
        /* storage disabled */
      }
    }
  }, [token]);

  if (!token) {
    return (
      <AuthShell title="Invitation link incomplete" description="This link is missing its invitation code. Ask whoever invited you to send it again.">
        <Button render={<Link to="/login" />} nativeButton={false} size="lg">
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  if (status === 'loading') {
    return (
      <AuthShell title="Checking your invitation…" description="One moment.">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </AuthShell>
    );
  }

  if (status !== 'authenticated' || !profile) {
    return (
      <AuthShell
        title="You've been invited to Vertex"
        description="Create your account (or sign in) using the exact email address this invitation was sent to, then you'll join the company automatically."
      >
        <div className="flex flex-col gap-3">
          <Button render={<Link to="/signup" />} nativeButton={false} size="lg">
            Create an account
          </Button>
          <Button render={<Link to="/login" />} nativeButton={false} variant="outline" size="lg">
            I already have an account
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (profile.companyId) {
    return (
      <AuthShell
        title="You're already in a company"
        description="Your Vertex account already belongs to a company, so this invitation can't be applied. Ask the person who invited you if you need to switch."
      >
        <Button render={<Link to="/" />} nativeButton={false} size="lg">
          Continue to Vertex
        </Button>
      </AuthShell>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await invitationService.acceptInvitation(token);
      try {
        window.localStorage.removeItem('vertex_pending_invite');
      } catch {
        /* noop */
      }
      const refreshed = await profileService.getById(profile.id);
      if (refreshed) setProfile(refreshed);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the invitation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Accept your invitation"
      description={`Signed in as ${profile.email ?? 'your account'}. Accepting will add you to the company and set your access.`}
    >
      <Seo noindex />
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
            <MailCheck className="size-4" aria-hidden="true" />
          </span>
          <p className="leading-relaxed text-muted-foreground">
            If this invitation was sent to a different email address, it won&apos;t be accepted — sign in with the
            correct account first.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="lg" onClick={() => void accept()} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Joining…
            </>
          ) : (
            'Accept & join'
          )}
        </Button>
      </div>
    </AuthShell>
  );
}
