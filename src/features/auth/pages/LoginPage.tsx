import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/config/supabase';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type FormValues = z.infer<typeof schema>;

const inputClasses =
  'w-full rounded-md border border-border bg-background px-md py-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Real Supabase email/password sign-in (Phase T) — replaces the Phase-0 one-button stub. */
export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(error.message);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-text-primary">Accounting Suite</h1>
        <p className="mt-xs text-sm text-text-secondary">Sign in to your account.</p>

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
              autoComplete="current-password"
              className={inputClasses}
              {...register('password')}
            />
            {errors.password && <p className="mt-xs text-sm text-danger">{errors.password.message}</p>}
          </div>

          {serverError && <p className="text-sm text-danger">{serverError}</p>}

          <Button type="submit" className="mt-sm w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-lg text-center text-sm text-text-secondary">
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
