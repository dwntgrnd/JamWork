import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { Sidebar } from '@/components/sidebar';
import { JamWorkIcon } from '@/components/jamwork-icon';
import { KeyboardShortcutsModal } from '@/components/keyboard-shortcuts-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sun, Moon, Menu, X, User, LogOut, Settings, Shield } from 'lucide-react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router';
import { apiGet } from '@/lib/api';

export default function ProtectedLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('JamWork');

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const projectIdMatch = pathname.match(/\/projects\/([^\/]+)/);
  const currentProjectId = projectIdMatch ? projectIdMatch[1] : null;

  useEffect(() => {
    const fetchWorkspaceName = async () => {
      try {
        const response = await apiGet<{ workspaceName: string }>('/workspace-settings');
        setWorkspaceName(response.workspaceName);
      } catch (error) {
        console.error('Failed to fetch workspace name:', error);
      }
    };
    fetchWorkspaceName();
  }, []);

  useEffect(() => {
    const handleWorkspaceUpdate = (e: CustomEvent<{ name: string }>) => {
      setWorkspaceName(e.detail.name);
    };
    window.addEventListener('workspace-name-updated', handleWorkspaceUpdate as EventListener);
    return () => {
      window.removeEventListener('workspace-name-updated', handleWorkspaceUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    document.title = workspaceName || 'JamWork';
  }, [workspaceName]);

  useKeyboardShortcuts([
    {
      key: '?',
      handler: () => setShortcutsModalOpen(true),
      description: 'Show keyboard shortcuts',
    },
    {
      key: '1',
      handler: () => {
        if (currentProjectId) {
          navigate(`/projects/${currentProjectId}`);
        } else {
          navigate('/my-tasks');
        }
      },
      description: 'Switch to List view',
    },
    {
      key: '2',
      handler: () => {
        if (currentProjectId) {
          navigate(`/projects/${currentProjectId}/board`);
        } else {
          navigate('/my-tasks');
        }
      },
      description: 'Switch to Board view',
    },
    {
      key: '3',
      handler: () => {
        if (currentProjectId) {
          navigate(`/projects/${currentProjectId}/timeline`);
        } else {
          navigate('/my-tasks');
        }
      },
      description: 'Switch to Timeline view',
    },
    {
      key: 'Escape',
      handler: () => {
        setShortcutsModalOpen(false);
      },
      description: 'Close modal',
    },
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 bg-header text-header-foreground shadow-[var(--shadow-header)] z-30">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden h-8 w-8 p-0 text-header-foreground hover:bg-header-foreground/10"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>

            <div className="flex items-center gap-2">
              <JamWorkIcon className="h-6 w-6 sm:h-7 sm:w-7" />
              <h1 className="text-xl sm:text-2xl font-bold">{workspaceName}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="h-8 w-8 text-header-foreground hover:bg-header-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 h-8 px-2 text-header-foreground hover:bg-header-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="h-6 w-6 rounded-full bg-interactive text-interactive-foreground text-xs font-medium flex items-center justify-center">
                    {user?.displayName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium max-w-30 truncate">
                    {user?.displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="cursor-pointer">
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            />
            <div className="fixed left-0 top-0 bottom-0 z-50 md:hidden">
              <Sidebar
                collapsed={false}
                onToggle={() => setMobileMenuOpen(false)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>
          </>
        )}

        <main className="flex-1 overflow-y-auto" aria-label="Main content">
          <Outlet />
        </main>
      </div>

      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onOpenChange={setShortcutsModalOpen}
      />
    </div>
  );
}
