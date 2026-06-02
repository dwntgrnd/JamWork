import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [hasAdmin, setHasAdmin] = useState(true); // Default true to hide link initially

  const showExpiredMessage = searchParams.get('expired') === 'true';
  const showResetSuccess = searchParams.get('reset') === 'success';

  useEffect(() => {
    apiGet<{ hasAdmin: boolean }>('/auth/status')
      .then((data) => setHasAdmin(data.hasAdmin))
      .catch(() => setHasAdmin(true)); // On error, default to hiding signup link
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);

      if (user.mustResetPassword) {
        navigate('/reset-password');
      } else {
        navigate('/my-tasks');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">AK12: JamWork</h1>
          <p className="text-muted-foreground">
            Lightweight task management for small teams
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Log In</CardTitle>
            <CardDescription>Sign in to your AK12: JamWork account</CardDescription>
          </CardHeader>
          <CardContent>
            {showExpiredMessage && (
              <div className="mb-4 p-3 bg-warning/10 border border-warning/25 rounded text-sm text-warning-foreground">
                Session expired. Please log in again.
              </div>
            )}

            {showResetSuccess && (
              <div className="mb-4 p-3 bg-success/10 border border-success/25 rounded text-sm text-success">
                Password reset successfully. You can now log in with your new password.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Logging in...' : 'Log In'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground space-y-2">
              <div>
                <Link to="/forgot-password" className="text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              {!hasAdmin && (
                <div>
                  Don't have an account?{' '}
                  <Link to="/signup" className="text-primary hover:underline">
                    Create admin account
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
