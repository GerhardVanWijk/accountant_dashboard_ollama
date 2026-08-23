import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/config/supabase';

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

const inputClasses =
  'w-full rounded-md border border-border bg-background px-md py-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Real Supabase sign-up (Phase T). A `profiles` row is auto-created by a DB
 * trigger the moment `auth.users` gets the new row (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase A) — nothing here inserts one directly. Whether a session comes
 * back immediately depends on this Supabase project's "Confirm email"
 * auth setting (a dashboard toggle, not something any MCP tool exposes):
 * if it's off, `signUp()` returns a live session and this can route
 * straight into onboarding; if it's on, there is no session yet and the
 * user needs to confirm via email first.
 */
export function SignUpPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
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
    setConfirmationSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-text-primary">Create your account</h1>

        {confirmationSent ? (
          <p className="mt-lg text-sm text-text-secondary">
            Check your email to confirm your account, then{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              sign in
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-xs text-sm text-text-secondary">You'll set up or join a company next.</p>

            <form className="mt-lg flex flex-col gap-md" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <label htmlFor="email" className="mb-xs block text-sm font-medium text-text-primary">
                  Email
                </label>
                <input id="email" type="email" autoComplete="email" className={inputClasses} {...register('email')} />
                {errors.email && <p className="mt-xs text-sm text-danger">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className="mb-xs block text-sm font-medium text-text-primary">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className={inputClasses}
                  {...register('password')}
                />
                {errors.password && <p className="mt-xs text-sm text-danger">{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-xs block text-sm font-medium text-text-primary">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  className={inputClasses}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && <p className="mt-xs text-sm text-danger">{errors.confirmPassword.message}</p>}
              </div>

              {serverError && <p className="text-sm text-danger">{serverError}</p>}

              <Button type="submit" className="mt-sm w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </>
        )}

        <p className="mt-lg text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
