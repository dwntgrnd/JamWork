
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { User } from '@/types';
import { apiPost, apiGet, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Trash2, KeyRound, Pencil } from 'lucide-react';

export default function AdminPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reset password state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Edit user state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Workspace settings state
  const [workspaceName, setWorkspaceName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSuccess, setWorkspaceSuccess] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  // Fetch workspace name and users - must be before any conditional returns (React hooks rules)
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch workspace name
        const workspaceResponse = await apiGet<{ workspaceName: string }>('/workspace-settings');
        setWorkspaceName(workspaceResponse.workspaceName);
        setOriginalName(workspaceResponse.workspaceName);

        // Fetch users
        const usersResponse = await apiGet<{ users: User[] }>('/auth/users');
        setUsers(usersResponse.users);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setUsersLoading(false);
      }
    };

    if (user?.role === 'admin') {
      fetchData();
    }
  }, [user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    try {
      const response = await apiPost<{ user: User; temporaryPassword: string; emailSent: boolean; message: string }>('/admin/invite', {
        email,
        displayName,
      });

      const emailStatus = response.emailSent
        ? 'Invitation email sent.'
        : 'Email could not be sent — share the credentials manually.';
      setInviteSuccess(`User created. Temporary password: ${response.temporaryPassword}\n${emailStatus}`);
      setEmail('');
      setDisplayName('');

      // Refresh users list
      const usersResponse = await apiGet<{ users: User[] }>('/auth/users');
      setUsers(usersResponse.users);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to invite user');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleTransferClick = (userId: string) => {
    setSelectedUserId(userId);
    setTransferDialogOpen(true);
  };

  const handleTransferConfirm = async () => {
    if (!selectedUserId) return;

    setTransferLoading(true);

    try {
      await apiPut('/admin/transfer', { targetUserId: selectedUserId });

      // Refresh users list
      const usersResponse = await apiGet<{ users: User[] }>('/auth/users');
      setUsers(usersResponse.users);

      // Refresh current user to reflect role change
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to transfer admin rights');
    } finally {
      setTransferLoading(false);
      setTransferDialogOpen(false);
      setSelectedUserId(null);
    }
  };

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return;

    setDeleteLoading(true);

    try {
      await apiDelete(`/admin/users/${deleteUserId}`);

      // Refresh users list
      const usersResponse = await apiGet<{ users: User[] }>('/auth/users');
      setUsers(usersResponse.users);
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      setDeleteUserId(null);
    }
  };

  const handleResetPasswordClick = (userId: string) => {
    setResetUserId(userId);
    setResetResult(null);
    setResetDialogOpen(true);
  };

  const handleResetPasswordConfirm = async () => {
    if (!resetUserId) return;
    setResetLoading(true);
    try {
      const response = await apiPut<{ temporaryPassword: string }>(`/admin/users/${resetUserId}/reset-password`);
      setResetResult(response.temporaryPassword);
      // Don't close dialog — show the password
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
      setResetDialogOpen(false);
    } finally {
      setResetLoading(false);
    }
  };

  const handleEditClick = (u: User) => {
    setEditUserId(u.id);
    setEditEmail(u.email);
    setEditDisplayName(u.displayName);
    setEditError('');
    setEditDialogOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!editUserId) return;
    setEditLoading(true);
    setEditError('');
    try {
      await apiPut(`/admin/users/${editUserId}`, {
        email: editEmail,
        displayName: editDisplayName,
      });
      const usersResponse = await apiGet<{ users: User[] }>('/auth/users');
      setUsers(usersResponse.users);
      setEditDialogOpen(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  const handleWorkspaceNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkspaceError('');
    setWorkspaceSuccess('');

    // Client-side validation
    const trimmedName = workspaceName.trim();
    if (!trimmedName) {
      setWorkspaceError('Workspace name cannot be empty');
      return;
    }
    if (trimmedName.length > 50) {
      setWorkspaceError('Workspace name must be 50 characters or less');
      return;
    }

    setWorkspaceSaving(true);

    try {
      const response = await apiPut<{ workspaceName: string }>('/workspace-settings', {
        name: trimmedName,
      });

      setWorkspaceSuccess('Workspace name updated');
      setOriginalName(response.workspaceName);
      setWorkspaceName(response.workspaceName);

      // Dispatch custom event for header to listen to
      window.dispatchEvent(
        new CustomEvent('workspace-name-updated', { detail: { name: response.workspaceName } })
      );

      // Clear success message after 3 seconds
      setTimeout(() => {
        setWorkspaceSuccess('');
      }, 3000);
    } catch (err: any) {
      setWorkspaceError(err.message || 'Failed to update workspace name');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const deleteUser = users.find(u => u.id === deleteUserId);
  const resetUser = users.find(u => u.id === resetUserId);
  const hasChanged = workspaceName.trim() !== originalName;

  // Check if user is admin (after all hooks)
  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>You must be an admin to access this page</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/my-tasks">
                <Button>Return to Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/my-tasks"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>

          <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>

          {/* Workspace Settings Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Workspace Settings</CardTitle>
              <CardDescription>Configure your workspace name visible to all team members</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleWorkspaceNameSubmit} className="space-y-2">
                <Label htmlFor="workspaceName">Workspace Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="workspaceName"
                    value={workspaceName}
                    onChange={(e) => {
                      setWorkspaceName(e.target.value);
                      setWorkspaceError('');
                      setWorkspaceSuccess('');
                    }}
                    maxLength={50}
                    placeholder="Enter workspace name"
                  />
                  <Button type="submit" disabled={workspaceSaving || !hasChanged}>
                    {workspaceSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {workspaceName.length}/50
                </p>
                {workspaceError && (
                  <div className="text-sm text-destructive">{workspaceError}</div>
                )}
                {workspaceSuccess && (
                  <div className="text-sm text-success">{workspaceSuccess}</div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Add User Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Add User</CardTitle>
              <CardDescription>Create a new account — a temporary password will be generated automatically</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                </div>

                {inviteError && (
                  <div className="text-sm text-destructive">{inviteError}</div>
                )}

                {inviteSuccess && (
                  <div className="space-y-1">
                    {inviteSuccess.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={`text-sm ${
                          line.includes('could not be sent')
                            ? 'text-warning-foreground'
                            : 'text-success'
                        }`}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? 'Creating user...' : 'Add User'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Team Members Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage your team</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <p className="text-muted-foreground">Loading users...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.displayName}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              u.role === 'admin'
                                ? 'bg-info/15 text-info'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.role !== 'admin' && u.id !== user?.id && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleTransferClick(u.id)}
                                >
                                  Make Admin
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(u)}
                                  title="Edit user"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResetPasswordClick(u.id)}
                                  title="Reset password"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteClick(u.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transfer Admin Dialog */}
      <AlertDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Admin Rights</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to transfer admin rights to{' '}
              <strong>{selectedUser?.displayName}</strong>? You will become a regular member and
              will lose admin privileges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransferConfirm} disabled={transferLoading}>
              {transferLoading ? 'Transferring...' : 'Transfer Admin Rights'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={(open) => { if (!open) { setResetDialogOpen(false); setResetResult(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resetResult ? 'Password Reset' : 'Reset Password'}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetResult ? (
                <>
                  New temporary password for <strong>{resetUser?.displayName}</strong>:
                  <code className="block mt-2 p-2 bg-muted rounded text-foreground text-sm font-mono select-all">
                    {resetResult}
                  </code>
                  <span className="block mt-2">Share this password with the user. They will be required to change it on next login.</span>
                </>
              ) : (
                <>
                  Are you sure you want to reset the password for{' '}
                  <strong>{resetUser?.displayName}</strong>? A new temporary password will be generated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {resetResult ? (
              <AlertDialogAction onClick={() => { setResetDialogOpen(false); setResetResult(null); }}>
                Done
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={resetLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={(e) => { e.preventDefault(); handleResetPasswordConfirm(); }} disabled={resetLoading}>
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update this user&apos;s profile information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">Display Name</Label>
              <Input
                id="editDisplayName"
                value={editDisplayName}
                onChange={(e) => { setEditDisplayName(e.target.value); setEditError(''); }}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editEmail}
                onChange={(e) => { setEditEmail(e.target.value); setEditError(''); }}
              />
            </div>
            {editError && (
              <div className="text-sm text-destructive">{editError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editLoading}>
              Cancel
            </Button>
            <Button onClick={handleEditConfirm} disabled={editLoading}>
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteUser?.displayName}</strong> ({deleteUser?.email})?
              Their tasks and projects will be reassigned to you. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
