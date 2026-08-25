import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { supabase } from '@/config/supabase';
import { AuthShell } from '../components/AuthShell';

const schema = z
  .object({
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Real Supabase sign-up (Phase T; re-skinned M6 onto the v0 AuthShell
 * design — docs/SUPABASE_MIGRATION_GUIDE.md). Behavior unchanged: a
 * `profiles` row is auto-created by a DB trigger the moment `auth.users`
 * gets the new row — nothing here inserts one directly. Whether a session
 * comes back immediately depends on this Supabase project's "Confirm
 * email" auth setting (a dashboard toggle, not something any MCP tool
 * exposes, and M6 does not touch it): if it's off, `signUp()` returns a
 * live session and this routes straight into onboarding; if it's on,
 * there is no session yet and the user needs to confirm via email first.
 */
export function SignUpPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({ email: values.email, password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    if (data.session) {
      navigate('/', { replace: true });
      return;
    }
    setSentTo(values.email);
    setConfirmationSent(true);
  };

  if (confirmationSent) {
    return (
      <AuthShell title="Check your inbox" description="You'll set up or join a company once you've confirmed your email.">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <MailCheck className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Confirm your email</p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>. Follow it, then sign in below.
            </p>
          </div>

          <Button render={<Link to="/login" />} nativeButton={false} size="lg">
            Continue to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your workspace"
      description="You'll set up or join a company next."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-10"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && (
            <p role="alert" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={errors.confirmPassword ? true : undefined} {...register('confirmPassword')} />
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
              Creating account
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
