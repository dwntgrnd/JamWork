import { useState, useEffect } from 'react';
import { setCachedWorkspaceName } from '@/hooks/use-workspace-name';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Workspace name settings. Self-contained — the workspace name is not shared
 * with the Team or Reports tabs, so this component owns its own fetch and state.
 */
export function AdminWorkspaceTab() {
  const [workspaceName, setWorkspaceName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSuccess, setWorkspaceSuccess] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const response = await apiGet<{ workspaceName: string }>('/workspace-settings');
        setWorkspaceName(response.workspaceName);
        setOriginalName(response.workspaceName);
      } catch (error) {
        console.error('Failed to fetch workspace settings:', error);
      }
    };
    fetchWorkspace();
  }, []);

  const handleWorkspaceNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkspaceError('');
    setWorkspaceSuccess('');

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

      // Update the cached workspace name so the header reflects it immediately.
      setCachedWorkspaceName(response.workspaceName);

      setTimeout(() => {
        setWorkspaceSuccess('');
      }, 3000);
    } catch (err: unknown) {
      setWorkspaceError(getErrorMessage(err, 'Failed to update workspace name'));
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const hasChanged = workspaceName.trim() !== originalName;

  return (
    <Card>
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
  );
}
