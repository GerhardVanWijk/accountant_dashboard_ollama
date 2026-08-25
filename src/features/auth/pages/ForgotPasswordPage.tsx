import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { supabase } from '@/config/supabase';
import { AuthShell } from '../components/AuthShell';

const schema = z.object({
  email: z.string().email('Enter the email address on your account.'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Real Supabase password-reset request (M6 — first UI onto this app's
 * existing Supabase Auth capability; no such page existed before this
 * phase, docs/SUPABASE_MIGRATION_GUIDE.md). `redirectTo` must be present
 * in the Supabase project's Auth → URL Configuration allow-list or
 * Supabase silently falls back to its default redirect — a dashboard
 * setting this session cannot change (same class of manual-only toggle as
 * "Anonymous Sign-ins"/"Confirm email"), flagged in the M6 report rather
 * than assumed configured.
 *
 * Supabase's own API never reveals whether an account exists for a given
 * email (enumeration protection) — the success panel below is always shown
 * on a non-error response, matching that behavior honestly rather than
 * claiming a specific outcome the API doesn't confirm.
 */
export function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSentTo(values.email);
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox" description="A password reset link is on its way, if an account exists for that address.">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <MailCheck className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Check your inbox</p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, a reset link is on its way.
            </p>
          </div>

          <Button render={<Link to="/login" />} nativeButton={false} variant="ghost" size="lg">
            <ArrowLeft data-icon="inline-start" />
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" description="Enter the email address on your account and we'll send you a reset link.">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.co.za" aria-invalid={errors.email ? true : undefined} {...register('email')} />
          {errors.email && (
            <p role="alert" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Sending link
            </>
          ) : (
            'Send reset link'
          )}
        </Button>

        <Button render={<Link to="/login" />} nativeButton={false} variant="ghost" size="lg">
          <ArrowLeft data-icon="inline-start" />
          Back to sign in
        </Button>
      </form>
    </AuthShell>
  );
}
