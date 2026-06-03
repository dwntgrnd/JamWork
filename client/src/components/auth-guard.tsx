import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, serverError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Don't bounce to login on a server error — logging in needs the server too.
    if (!loading && !serverError) {
      if (!user) {
        navigate('/login');
      } else if (user.mustResetPassword) {
        navigate('/reset-password');
      }
    }
  }, [user, loading, serverError, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (serverError) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4"
        role="alert"
      >
        <h1 className="text-lg font-semibold">Can’t reach the server</h1>
        <p className="text-muted-foreground max-w-sm">
          We couldn’t connect to JamWork. This is usually temporary — please try again in a moment.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-interactive-foreground hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!user || user.mustResetPassword) {
    return null;
  }

  return <>{children}</>;
}
