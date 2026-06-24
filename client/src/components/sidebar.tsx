import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import { apiPost, apiDelete, getErrorMessage } from '@/lib/api';
import { useProjects, invalidateProjects } from '@/hooks/use-projects';
import { useSidebarPreferences, useUpdateSidebarPreferences, PREFERENCES_KEY } from '@/hooks/use-preferences';
import { queryClient } from '@/lib/query-client';
import { ProjectPickerPopover } from '@/components/sidebar/project-picker-popover';
import { Project } from '@/types';
import type { SidebarPreferences, SidebarView } from '@/types/preferences';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  ListTodo,
  List,
  Folder,
  Plus,
  Pin,
  Trash2,
  Calendar,
  GanttChart,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loading } = useProjects();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectStartDate, setNewProjectStartDate] = useState('');
  const [newProjectEndDate, setNewProjectEndDate] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Sidebar All/Mine filtering (CC37). Preferences load once; switching views
  // and editing the curated list filter the in-memory project list client-side.
  const { data: sidebarPrefs } = useSidebarPreferences();
  const updateSidebarPrefs = useUpdateSidebarPreferences();
  const view = sidebarPrefs?.view ?? 'all';
  const pinnedProjects = sidebarPrefs?.pinnedProjects ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Project name is required');
      return;
    }

    if (newProjectName.length > 100) {
      setError('Project name must be 100 characters or less');
      return;
    }

    try {
      setError('');
      const data = await apiPost<{ project: Project }>('/projects', {
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
        startDate: newProjectStartDate || undefined,
        endDate: newProjectEndDate || undefined,
      });

      invalidateProjects();
      setShowCreateDialog(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectStartDate('');
      setNewProjectEndDate('');

      // Navigate to new project
      navigate(`/projects/${data.project.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create project'));
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return;

    try {
      await apiDelete(`/projects/${deleteProjectId}`);
      invalidateProjects();
      setDeleteProjectId(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
      toast.error('Failed to delete project');
    }
  };

  const isActiveProject = (projectId: string) => {
    return pathname.startsWith(`/projects/${projectId}`);
  };

  // In "Mine" view, render only the curated projects; stale ids (deleted
  // projects) simply have no match and drop out silently.
  const pinnedSet = new Set(pinnedProjects);
  const displayedProjects = view === 'mine' ? projects.filter((p) => pinnedSet.has(p.id)) : projects;

  // Always persist the full sidebar namespace (the server replaces it wholesale).
  // Derive from the freshest cached value rather than the render snapshot, so
  // back-to-back toggles build on each other instead of overwriting with stale state.
  const currentPrefs = (): SidebarPreferences =>
    queryClient.getQueryData<SidebarPreferences>(PREFERENCES_KEY) ?? { view, pinnedProjects };
  const handleViewChange = (next: SidebarView) => {
    updateSidebarPrefs.mutate({ ...currentPrefs(), view: next });
  };
  const handleTogglePin = (projectId: string, checked: boolean) => {
    const cur = currentPrefs();
    updateSidebarPrefs.mutate({
      view: cur.view,
      pinnedProjects: checked
        ? [...cur.pinnedProjects, projectId]
        : cur.pinnedProjects.filter((id) => id !== projectId),
    });
  };

  return (
    <>
      <TooltipProvider>
        <nav
          className={cn(
            'flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200',
            collapsed ? 'w-16' : 'w-64'
          )}
          aria-label="Main navigation"
        >
          {/* Toggle button */}
          <div className="p-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* VIEWS section */}
          <div className="px-3 space-y-1">
            {!collapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2 block">
                Views
              </span>
            )}

            {/* My Tasks */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/my-tasks" onClick={onNavigate} aria-current={pathname === '/my-tasks' ? 'page' : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pathname === '/my-tasks' && "bg-sidebar-accent text-sidebar-primary font-medium"
                      )}
                      aria-label="My Tasks"
                    >
                      <ListTodo className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">My Tasks</TooltipContent>
              </Tooltip>
            ) : (
              <Link to="/my-tasks" onClick={onNavigate} aria-current={pathname === '/my-tasks' ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    pathname === '/my-tasks' && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                >
                  <ListTodo className="h-5 w-5 mr-2" />
                  My Tasks
                </Button>
              </Link>
            )}

            {/* All Tasks */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/all-tasks" onClick={onNavigate} aria-current={pathname === '/all-tasks' ? 'page' : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pathname === '/all-tasks' && "bg-sidebar-accent text-sidebar-primary font-medium"
                      )}
                      aria-label="All Tasks"
                    >
                      <List className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">All Tasks</TooltipContent>
              </Tooltip>
            ) : (
              <Link to="/all-tasks" onClick={onNavigate} aria-current={pathname === '/all-tasks' ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    pathname === '/all-tasks' && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                >
                  <List className="h-5 w-5 mr-2" />
                  All Tasks
                </Button>
              </Link>
            )}

            {/* Timeline */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/timeline" onClick={onNavigate} aria-current={pathname === '/timeline' ? 'page' : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pathname === '/timeline' && "bg-sidebar-accent text-sidebar-primary font-medium"
                      )}
                      aria-label="Timeline"
                    >
                      <GanttChart className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Timeline</TooltipContent>
              </Tooltip>
            ) : (
              <Link to="/timeline" onClick={onNavigate} aria-current={pathname === '/timeline' ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    pathname === '/timeline' && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                >
                  <GanttChart className="h-5 w-5 mr-2" />
                  Timeline
                </Button>
              </Link>
            )}

            {/* Sprints */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/sprints" onClick={onNavigate} aria-current={pathname === '/sprints' ? 'page' : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pathname === '/sprints' && "bg-sidebar-accent text-sidebar-primary font-medium"
                      )}
                      aria-label="Sprints"
                    >
                      <Calendar className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Sprints</TooltipContent>
              </Tooltip>
            ) : (
              <Link to="/sprints" onClick={onNavigate} aria-current={pathname === '/sprints' ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    pathname === '/sprints' && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                >
                  <Calendar className="h-5 w-5 mr-2" />
                  Sprints
                </Button>
              </Link>
            )}

            {/* Reports */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/reports" onClick={onNavigate} aria-current={pathname === '/reports' ? 'page' : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pathname === '/reports' && "bg-sidebar-accent text-sidebar-primary font-medium"
                      )}
                      aria-label="Reports"
                    >
                      <FileText className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Reports</TooltipContent>
              </Tooltip>
            ) : (
              <Link to="/reports" onClick={onNavigate} aria-current={pathname === '/reports' ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    pathname === '/reports' && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                >
                  <FileText className="h-5 w-5 mr-2" />
                  Reports
                </Button>
              </Link>
            )}
          </div>

          {/* PROJECTS section */}
          <div className="flex-1 overflow-y-auto mt-6">
            <div className="px-3 mb-2 flex items-center justify-between">
              {!collapsed && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects
                </span>
              )}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateDialog(true)}
                      className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Create project"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Create Project</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateDialog(true)}
                  className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Create project"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Project list */}
            <div className="space-y-1 px-3">
              {loading ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Loading...
                </div>
              ) : projects.length === 0 ? (
                !collapsed && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No projects yet
                  </div>
                )
              ) : view === 'mine' && displayedProjects.length === 0 ? (
                !collapsed && (
                  <div className="text-center py-4 px-2 space-y-2">
                    <p className="text-sm text-muted-foreground">No pinned projects yet.</p>
                    <Button
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                      className="w-full"
                    >
                      Pin projects
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleViewChange('all')}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      Show all projects
                    </button>
                  </div>
                )
              ) : (
                displayedProjects.map((project) => {
                  const isPinned = pinnedSet.has(project.id);
                  return (
                  <div key={project.id} className="group relative">
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link to={`/projects/${project.id}`} onClick={onNavigate} aria-current={isActiveProject(project.id) ? 'page' : undefined}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "w-full h-10 p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                isActiveProject(project.id) && "bg-sidebar-accent text-sidebar-primary font-medium"
                              )}
                              aria-label={project.name}
                            >
                              <Folder className="h-5 w-5" />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {project.name}
                          {project._count && ` (${project._count.tasks})`}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link to={`/projects/${project.id}`} onClick={onNavigate} aria-current={isActiveProject(project.id) ? 'page' : undefined}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "w-full justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isActiveProject(project.id) && "bg-sidebar-accent text-sidebar-primary font-medium"
                          )}
                        >
                          <Folder className="h-4 w-4 mr-2 shrink-0" />
                          <span className="truncate flex-1 text-left" title={project.name}>
                            {project.name}
                          </span>
                        </Button>
                      </Link>
                    )}

                    {!collapsed && project._count && project._count.tasks > 0 && (
                      <Badge
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-5 px-1.5 text-xs rounded-full bg-[var(--sidebar-count-bg)] text-[var(--sidebar-count-fg)] group-hover:opacity-0 transition-opacity pointer-events-none"
                      >
                        {project._count.tasks}
                      </Badge>
                    )}

                    {!collapsed && (
                      <button
                        type="button"
                        onClick={() => handleTogglePin(project.id, !isPinned)}
                        aria-label={isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
                        aria-pressed={isPinned}
                        className={cn(
                          "absolute right-8 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isPinned
                            ? "text-sidebar-primary opacity-100"
                            : "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                      >
                        <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
                      </button>
                    )}

                    {!collapsed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteProjectId(project.id)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* All / Mine filter footer (CC37) — fixed below the scrollable list.
              Hidden when collapsed; filtering still applies to the icon list. */}
          {!collapsed && (
            <div className="border-t border-sidebar-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm',
                      view === 'all' ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    All
                  </span>
                  <Switch
                    checked={view === 'mine'}
                    onCheckedChange={(checked) => handleViewChange(checked ? 'mine' : 'all')}
                    aria-label="Show only pinned projects"
                  />
                  <span
                    className={cn(
                      'text-sm',
                      view === 'mine' ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    Pinned
                  </span>
                </div>
                {view === 'mine' && (
                  <ProjectPickerPopover
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    projects={projects}
                    pinnedProjects={pinnedProjects}
                    onToggle={handleTogglePin}
                  />
                )}
              </div>
            </div>
          )}
        </nav>
      </TooltipProvider>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Add a new project to organize your tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                maxLength={100}
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Optional project description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="project-start-date">Start Date</Label>
                <Input
                  id="project-start-date"
                  type="date"
                  value={newProjectStartDate}
                  onChange={(e) => setNewProjectStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="project-end-date">End Date</Label>
                <Input
                  id="project-end-date"
                  type="date"
                  value={newProjectEndDate}
                  onChange={(e) => setNewProjectEndDate(e.target.value)}
                  min={newProjectStartDate || undefined}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewProjectName('');
                setNewProjectDescription('');
                setNewProjectStartDate('');
                setNewProjectEndDate('');
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateProject}>Create Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation */}
      <AlertDialog
        open={!!deleteProjectId}
        onOpenChange={() => setDeleteProjectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all its tasks. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
