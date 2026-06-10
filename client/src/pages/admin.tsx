import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { User, isAdminOrOwner } from '@/types';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { AdminWorkspaceTab } from './admin-workspace-tab';
import { AdminTeamTab } from './admin-team-tab';
import { AdminReportsTab } from './admin-reports-tab';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Shared across the Team (and, later, Reports) tabs — fetched at the parent.
  const refreshUsers = async () => {
    const response = await apiGet<{ users: User[] }>('/auth/users');
    setUsers(response.users);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiGet<{ users: User[] }>('/auth/users');
        setUsers(response.users);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setUsersLoading(false);
      }
    };

    if (isAdminOrOwner(user?.role)) {
      fetchData();
    }
  }, [user]);

  // Check access (after all hooks)
  if (user && !isAdminOrOwner(user.role)) {
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

        <Tabs defaultValue="workspace">
          <TabsList>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="workspace" className="mt-4">
            <AdminWorkspaceTab />
          </TabsContent>
          <TabsContent value="team" className="mt-4">
            <AdminTeamTab
              users={users}
              usersLoading={usersLoading}
              currentUser={user}
              refreshUsers={refreshUsers}
            />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <AdminReportsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
