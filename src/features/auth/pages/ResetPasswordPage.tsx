import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { supabase } from '@/config/supabase';
import { cn } from '@/lib/utils';
import { AuthShell } from '../components/AuthShell';

const rules = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /\d/.test(v) },
];

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Real Supabase password-reset completion (M6 — first UI onto this app's
 * existing Supabase Auth capability, the callback target for
 * ForgotPasswordPage's `redirectTo`, docs/SUPABASE_MIGRATION_GUIDE.md).
 * Following the emailed reset link establishes a temporary recovery
 * session automatically (supabase-js's default `detectSessionInUrl: true`
 * — src/config/supabase.ts sets no override); `updateUser({ password })`
 * then runs against that session. If the visitor reached this page any
 * other way (no valid recovery session), the call errors naturally and
 * `serverError` surfaces it — no separate token-validity check invented
 * here.
 */
export function ResetPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const password = watch('password') ?? '';

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <AuthShell title="Password updated" description="You can sign in with your new password.">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-status-positive-surface text-status-positive">
              <ShieldCheck className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Password updated</p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">Your password has been changed. Sign in to continue.</p>
          </div>

          <Button render={<Link to="/login" />} nativeButton={false} size="lg">
            Continue to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" description="Choose a new password for your account.">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" aria-invalid={errors.password ? true : undefined} {...register('password')} />
        </div>

        <ul className="flex flex-col gap-1.5">
          {rules.map((rule) => {
            const ok = rule.test(password);
            return (
              <li key={rule.label} className={cn('flex items-center gap-2 text-xs', ok ? 'text-status-positive' : 'text-muted-foreground')}>
                <Check className={cn('size-3.5', !ok && 'opacity-30')} aria-hidden="true" />
                {rule.label}
              </li>
            );
          })}
        </ul>
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={errors.confirmPassword ? true : undefined} {...register('confirmPassword')} />
          {errors.confirmPassword && (
            <p role="alert" className="text-sm text-destructive">
              {errors.confirmPassword.message}
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
              Updating
            </>
          ) : (
            'Set new password'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
