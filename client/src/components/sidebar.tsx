import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Project } from '@/types';
import { Button } from '@/components/ui/button';
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
  Trash2,
  Calendar,
  GanttChart,
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectStartDate, setNewProjectStartDate] = useState('');
  const [newProjectEndDate, setNewProjectEndDate] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();

    const handleProjectsUpdated = () => fetchProjects();
    window.addEventListener('projects-updated', handleProjectsUpdated);
    return () => {
      window.removeEventListener('projects-updated', handleProjectsUpdated);
    };
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ projects: Project[] }>('/projects');
      setProjects(data.projects);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  };

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

      setProjects([...projects, data.project]);
      setShowCreateDialog(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectStartDate('');
      setNewProjectEndDate('');

      // Navigate to new project
      navigate(`/projects/${data.project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return;

    try {
      await apiDelete(`/projects/${deleteProjectId}`);
      setProjects(projects.filter((p) => p.id !== deleteProjectId));
      setDeleteProjectId(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
      toast.error('Failed to delete project');
    }
  };

  const isActiveProject = (projectId: string) => {
    return pathname.startsWith(`/projects/${projectId}`);
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
              ) : (
                projects.map((project) => (
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
                ))
              )}
            </div>
          </div>
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
