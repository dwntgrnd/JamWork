import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, Sun, Moon, Monitor } from 'lucide-react';
import { PasswordGenerator } from '@/components/password-generator';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, changePassword, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileName, setProfileName] = useState(user?.displayName || '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileEmail(user.email);
      setProfileName(user.displayName);
    }
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!profileEmail.trim()) {
      setProfileError('Email is required');
      return;
    }
    if (!profileName.trim()) {
      setProfileError('Display name is required');
      return;
    }

    setProfileLoading(true);
    try {
      await updateProfile(profileEmail, profileName);
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const profileHasChanged = user && (profileEmail !== user.email || profileName !== user.displayName);

  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('theme');
    return stored ? (stored as 'light' | 'dark') : 'system';
  });

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    setThemePreference(value);
    if (value === 'system') {
      localStorage.removeItem('theme');
      const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(systemPreference);
    } else {
      setTheme(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters');
      return;
    }

    setLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/my-tasks"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-foreground">Settings</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your display name and email address</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profileName">Display Name</Label>
                  <Input
                    id="profileName"
                    type="text"
                    value={profileName}
                    onChange={(e) => { setProfileName(e.target.value); setProfileError(''); setProfileSuccess(''); }}
                    required
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profileEmail">Email</Label>
                  <Input
                    id="profileEmail"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => { setProfileEmail(e.target.value); setProfileError(''); setProfileSuccess(''); }}
                    required
                  />
                </div>

                {profileError && (
                  <div className="text-sm text-destructive">{profileError}</div>
                )}

                {profileSuccess && (
                  <div className="text-sm text-success">{profileSuccess}</div>
                )}

                <Button type="submit" disabled={profileLoading || !profileHasChanged}>
                  {profileLoading ? 'Saving...' : 'Save Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how AK12: JamWork looks on your device</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Label>Theme</Label>
                <RadioGroup value={themePreference} onValueChange={handleThemeChange}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="theme-light" />
                    <Label htmlFor="theme-light" className="flex items-center gap-2 cursor-pointer font-normal">
                      <Sun className="h-4 w-4" />
                      Light
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="theme-dark" />
                    <Label htmlFor="theme-dark" className="flex items-center gap-2 cursor-pointer font-normal">
                      <Moon className="h-4 w-4" />
                      Dark
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="theme-system" />
                    <Label htmlFor="theme-system" className="flex items-center gap-2 cursor-pointer font-normal">
                      <Monitor className="h-4 w-4" />
                      System
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  System theme follows your device's color scheme preference
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Minimum 10 characters</p>
                  <PasswordGenerator onGenerate={(pw) => { setNewPassword(pw); setConfirmPassword(pw); }} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={10}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive">{error}</div>
                )}

                {success && (
                  <div className="text-sm text-success">{success}</div>
                )}

                <Button type="submit" disabled={loading} className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {loading ? 'Changing password...' : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
