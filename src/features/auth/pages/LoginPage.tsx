import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';

/**
 * Phase 0 auth stub. Real credential handling, validation, and session
 * management belong to the auth feature module in a later phase.
 */
export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSignIn = () => {
    login();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-text-primary">Accounting Suite</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Sign-in is a Phase 0 stub — real authentication ships in a later phase.
        </p>
        <Button className="mt-lg w-full" onClick={handleSignIn}>
          Continue
        </Button>
      </Card>
    </div>
  );
}
