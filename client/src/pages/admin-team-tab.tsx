import { useState } from 'react';
import { User } from '@/types';
import { visibleActions } from '@/lib/team-actions';
import { apiPost, apiPut, apiDelete, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Trash2, KeyRound, Pencil } from 'lucide-react';

interface AdminTeamTabProps {
  users: User[];
  usersLoading: boolean;
  currentUser: User | null;
  refreshUsers: () => Promise<void>;
}

/** Three-tier role badge: distinct styles and capitalized labels. */
function roleBadge(role: string): { className: string; label: string } {
  switch (role) {
    case 'owner':
      return { className: 'bg-warning/15 text-warning-foreground', label: 'Owner' };
    case 'admin':
      return { className: 'bg-info/15 text-info', label: 'Admin' };
    default:
      return { className: 'bg-muted text-foreground', label: 'Member' };
  }
}

export function AdminTeamTab({ users, usersLoading, currentUser, refreshUsers }: AdminTeamTabProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

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

  // Promote / demote state
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);

  const [demoteDialogOpen, setDemoteDialogOpen] = useState(false);
  const [demoteUserId, setDemoteUserId] = useState<string | null>(null);
  const [demoteLoading, setDemoteLoading] = useState(false);

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

      await refreshUsers();
    } catch (err: unknown) {
      setInviteError(getErrorMessage(err, 'Failed to invite user'));
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

      await refreshUsers();

      // Refresh current user to reflect role change.
      window.location.reload();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to transfer ownership'));
    } finally {
      setTransferLoading(false);
      setTransferDialogOpen(false);
      setSelectedUserId(null);
    }
  };

  const handlePromoteClick = (userId: string) => {
    setPromoteUserId(userId);
    setPromoteDialogOpen(true);
  };

  const handlePromoteConfirm = async () => {
    if (!promoteUserId) return;
    setPromoteLoading(true);
    try {
      await apiPut(`/admin/users/${promoteUserId}/promote`);
      await refreshUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to promote user'));
    } finally {
      setPromoteLoading(false);
      setPromoteDialogOpen(false);
      setPromoteUserId(null);
    }
  };

  const handleDemoteClick = (userId: string) => {
    setDemoteUserId(userId);
    setDemoteDialogOpen(true);
  };

  const handleDemoteConfirm = async () => {
    if (!demoteUserId) return;
    setDemoteLoading(true);
    try {
      await apiPut(`/admin/users/${demoteUserId}/demote`);
      await refreshUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to remove admin access'));
    } finally {
      setDemoteLoading(false);
      setDemoteDialogOpen(false);
      setDemoteUserId(null);
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
      await refreshUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to delete user'));
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
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to reset password'));
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
      await refreshUsers();
      setEditDialogOpen(false);
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, 'Failed to update user'));
    } finally {
      setEditLoading(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const deleteUser = users.find(u => u.id === deleteUserId);
  const resetUser = users.find(u => u.id === resetUserId);
  const promoteUser = users.find(u => u.id === promoteUserId);
  const demoteUser = users.find(u => u.id === demoteUserId);

  return (
    <>
      <div className="space-y-8">
        {/* Add User Section */}
        <Card>
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
        <Card>
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
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${roleBadge(u.role).className}`}
                        >
                          {roleBadge(u.role).label}
                        </span>
                      </TableCell>
                      <TableCell>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        {(() => {
                          const actions = visibleActions(currentUser, u);
                          return (
                            <div className="flex items-center gap-2">
                              {actions.includes('promote') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePromoteClick(u.id)}
                                >
                                  Make Admin
                                </Button>
                              )}
                              {actions.includes('demote') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDemoteClick(u.id)}
                                >
                                  Remove Admin
                                </Button>
                              )}
                              {actions.includes('transfer') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleTransferClick(u.id)}
                                >
                                  Transfer Ownership
                                </Button>
                              )}
                              {actions.includes('edit') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(u)}
                                  title="Edit user"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {actions.includes('reset') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResetPasswordClick(u.id)}
                                  title="Reset password"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              )}
                              {actions.includes('delete') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteClick(u.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transfer Ownership Dialog */}
      <AlertDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Ownership</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer workspace ownership to <strong>{selectedUser?.displayName}</strong>? You
              will become an admin. <strong>{selectedUser?.displayName}</strong> will become the
              workspace owner. Only the owner can transfer ownership or manage admin roles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransferConfirm} disabled={transferLoading}>
              {transferLoading ? 'Transferring...' : 'Transfer Ownership'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to Admin Dialog */}
      <AlertDialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Grant admin privileges to <strong>{promoteUser?.displayName}</strong>? They will be
              able to manage team members and access workspace settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={promoteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteConfirm} disabled={promoteLoading}>
              {promoteLoading ? 'Promoting...' : 'Promote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Admin Access Dialog */}
      <AlertDialog open={demoteDialogOpen} onOpenChange={setDemoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin Access</AlertDialogTitle>
            <AlertDialogDescription>
              Remove admin privileges from <strong>{demoteUser?.displayName}</strong>? They will no
              longer be able to access the Admin Panel or manage team members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={demoteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDemoteConfirm} disabled={demoteLoading}>
              {demoteLoading ? 'Removing...' : 'Remove Admin Access'}
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
