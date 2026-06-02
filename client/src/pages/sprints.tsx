
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, getErrorMessage } from '@/lib/api';
import { Sprint, Task, Project, UserSummary, STATUS_LABELS, PRIORITY_LABELS } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Archive, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusPillClasses, formatStatusLabel, getPriorityDotColor } from '@/lib/style-tokens';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { TaskDrawer } from '@/components/task-drawer';
import { SprintCard } from '@/components/sprint-card';
import {
  CreateSprintDialog,
  EditSprintDialog,
  CloseSprintDialog,
} from '@/components/sprint-dialogs';

import { getAvatarColor } from '@/lib/style-tokens';

// Priority sort order
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Extended Sprint type with tasks and project relations
interface SprintWithTasks extends Sprint {
  tasks?: (Task & { project?: { id: string; name: string } })[];
}

export default function GlobalSprintsPage() {
  const [sprints, setSprints] = useState<SprintWithTasks[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSprintIds, setExpandedSprintIds] = useState<Set<string>>(new Set());

  // Create sprint dialog state
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintDescription, setNewSprintDescription] = useState('');
  const [newSprintStartDate, setNewSprintStartDate] = useState('');
  const [newSprintEndDate, setNewSprintEndDate] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit sprint dialog state
  const [editingSprint, setEditingSprint] = useState<SprintWithTasks | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editError, setEditError] = useState('');

  // Close sprint dialog state
  const [closingSprint, setClosingSprint] = useState<SprintWithTasks | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeAction, setCloseAction] = useState<'backlog' | 'next_sprint'>('backlog');
  const [closeNextSprintId, setCloseNextSprintId] = useState('');
  const [closeError, setCloseError] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  // Backlog filter/sort state
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [backlogFilters, setBacklogFilters] = useState<{
    projectIds: string[];
    priorities: string[];
    assigneeIds: string[];
    statuses: string[];
  }>({ projectIds: [], priorities: [], assigneeIds: [], statuses: [] });
  const [backlogSortBy, setBacklogSortBy] = useState<'priority' | 'project' | 'assignee' | 'createdAt' | 'dueDate'>('priority');
  const [backlogSortDir, setBacklogSortDir] = useState<'asc' | 'desc'>('desc');

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Task drawer state
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);
  const [drawerSprintId, setDrawerSprintId] = useState<string | null>(null);

  // Task edit drawer state
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchAllData();
    fetchProjects();
    fetchUsers();
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [backlogFilters, backlogSortBy, backlogSortDir]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [sprintData, taskData] = await Promise.all([
        apiGet<{ sprints: SprintWithTasks[] }>('/sprints?includeTasks=true&include=stats'),
        apiGet<{ tasks: Task[] }>('/tasks?sprintId=null'),
      ]);
      setSprints(sprintData.sprints);
      setBacklogTasks(taskData.tasks);

      // Clear selection after data refresh
      setSelectedTaskIds(new Set());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSprintExpanded = (sprintId: string) => {
    const newExpanded = new Set(expandedSprintIds);
    if (newExpanded.has(sprintId)) {
      newExpanded.delete(sprintId);
    } else {
      newExpanded.add(sprintId);
    }
    setExpandedSprintIds(newExpanded);
  };

  const handleMoveTask = async (taskId: string, targetSprintId: string | null, sprintName?: string) => {
    try {
      await apiPut(`/tasks/${taskId}`, { sprintId: targetSprintId });
      // Refresh all data (both sprints and backlog) to update counts and task lists
      await fetchAllData();
      // Show toast confirmation
      if (targetSprintId === null) {
        toast.success('Task moved to Backlog');
      } else {
        toast.success(`Task moved to ${sprintName || 'sprint'}`);
      }
    } catch (err) {
      console.error('Failed to move task:', err);
      toast.error('Failed to move task');
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiGet<{ projects: Project[] }>('/projects');
      setProjects(data.projects);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiGet<{ users: UserSummary[] }>('/auth/users');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const handleOpenCreateDialog = () => {
    setNewSprintName('');
    setNewSprintDescription('');
    setNewSprintStartDate('');
    setNewSprintEndDate('');
    setCreateError('');
    setShowCreateDialog(true);
  };

  const handleOpenEditDialog = (sprint: SprintWithTasks) => {
    setEditingSprint(sprint);
    setEditName(sprint.name);
    setEditDescription(sprint.description || '');
    setEditStartDate(new Date(sprint.startDate).toISOString().split('T')[0]);
    setEditEndDate(new Date(sprint.endDate).toISOString().split('T')[0]);
    setEditError('');
    setShowEditDialog(true);
  };

  const handleOpenCloseDialog = (sprint: SprintWithTasks) => {
    setClosingSprint(sprint);
    setCloseAction('backlog');
    setCloseNextSprintId('');
    setCloseError('');
    setCloseLoading(false);
    setShowCloseDialog(true);
  };

  const handleCloseSprint = async () => {
    if (!closingSprint) return;

    if (closeAction === 'next_sprint' && !closeNextSprintId) {
      setCloseError('Please select a sprint to move tasks to');
      return;
    }

    setCloseLoading(true);
    setCloseError('');

    try {
      const payload: { action: string; nextSprintId?: string } = { action: closeAction };
      if (closeAction === 'next_sprint') {
        payload.nextSprintId = closeNextSprintId;
      }

      await apiPut(`/sprints/${closingSprint.id}/close`, payload);

      setShowCloseDialog(false);
      setClosingSprint(null);
      toast.success('Sprint closed successfully');
      fetchAllData();
    } catch (err: unknown) {
      setCloseError(getErrorMessage(err, 'Failed to close sprint'));
    } finally {
      setCloseLoading(false);
    }
  };

  const handleOpenTaskDrawer = (sprintId: string | null) => {
    setDrawerSprintId(sprintId);
    setShowTaskDrawer(true);
  };

  const handleCreateSprint = async () => {
    if (!newSprintName.trim()) {
      setCreateError('Sprint name is required');
      return;
    }
    if (newSprintName.length > 100) {
      setCreateError('Sprint name must be 100 characters or less');
      return;
    }
    if (!newSprintStartDate || !newSprintEndDate) {
      setCreateError('Start date and end date are required');
      return;
    }

    const start = new Date(newSprintStartDate);
    const end = new Date(newSprintEndDate);

    if (end <= start) {
      setCreateError('End date must be after start date');
      return;
    }

    try {
      setCreateError('');
      await apiPost('/sprints', {
        name: newSprintName.trim(),
        description: newSprintDescription.trim() || null,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      setShowCreateDialog(false);
      await fetchAllData();
      toast.success(`Sprint "${newSprintName.trim()}" created`);
    } catch (err: unknown) {
      setCreateError(getErrorMessage(err, 'Failed to create sprint'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { setEditError('Sprint name is required'); return; }
    if (editName.length > 100) { setEditError('Sprint name must be 100 characters or less'); return; }
    if (!editStartDate || !editEndDate) { setEditError('Start and end dates are required'); return; }
    const start = new Date(editStartDate);
    const end = new Date(editEndDate);
    if (end <= start) { setEditError('End date must be after start date'); return; }
    try {
      setEditError('');
      await apiPut(`/sprints/${editingSprint!.id}`, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      setShowEditDialog(false);
      await fetchAllData();
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, 'Failed to update sprint'));
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Separate active and completed sprints
  const activeSprints = sprints.filter((s) => s.status === 'active');
  const completedSprints = sprints.filter((s) => s.status === 'completed');

  // Sort active sprints by startDate ascending
  activeSprints.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Categorize active sprints into current (in progress) and future (upcoming)
  const now = new Date();
  const currentSprints = activeSprints.filter((s) => new Date(s.startDate) <= now && new Date(s.endDate) >= now);
  const futureSprints = activeSprints.filter((s) => new Date(s.startDate) > now);
  // Active sprints whose end date has passed but that were never closed. They're
  // still assignable (the task drawer offers them); without this group they'd be
  // dropped from the assign dropdowns entirely — neither "current" nor "upcoming".
  const pastSprints = activeSprints.filter((s) => new Date(s.endDate) < now);

  // Apply filters to backlog tasks
  const filteredBacklog = backlogTasks.filter((task) => {
    if (backlogFilters.projectIds.length > 0 && !backlogFilters.projectIds.includes(task.projectId)) return false;
    if (backlogFilters.priorities.length > 0 && !backlogFilters.priorities.includes(task.priority)) return false;
    if (backlogFilters.statuses.length > 0 && !backlogFilters.statuses.includes(task.status)) return false;
    if (backlogFilters.assigneeIds.length > 0) {
      const taskAssigneeIds = (task.assignees || []).map((a) => a.userId);
      if (!backlogFilters.assigneeIds.some((id) => taskAssigneeIds.includes(id))) return false;
    }
    return true;
  });

  // Apply sort to filtered backlog
  const sortedFilteredBacklog = [...filteredBacklog].sort((a, b) => {
    const dir = backlogSortDir === 'asc' ? 1 : -1;
    switch (backlogSortBy) {
      case 'priority': {
        const pa = PRIORITY_ORDER[a.priority] ?? 4;
        const pb = PRIORITY_ORDER[b.priority] ?? 4;
        if (pa !== pb) return (pa - pb) * dir;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'project': {
        const pna = a.project?.name || '';
        const pnb = b.project?.name || '';
        return pna.localeCompare(pnb) * dir;
      }
      case 'assignee': {
        const ana = a.assignees?.[0]?.user?.displayName || '';
        const anb = b.assignees?.[0]?.user?.displayName || '';
        return ana.localeCompare(anb) * dir;
      }
      case 'createdAt':
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      case 'dueDate': {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return (da - db) * dir;
      }
      default:
        return 0;
    }
  });

  // Check if any filters are active
  const hasActiveFilters = backlogFilters.projectIds.length > 0 || backlogFilters.priorities.length > 0 || backlogFilters.assigneeIds.length > 0 || backlogFilters.statuses.length > 0;

  // Filter toggle helpers
  const toggleBacklogFilter = (key: keyof typeof backlogFilters, value: string) => {
    setBacklogFilters((prev) => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  const removeBacklogFilter = (key: keyof typeof backlogFilters, value: string) => {
    setBacklogFilters((prev) => ({
      ...prev,
      [key]: prev[key].filter((v) => v !== value),
    }));
  };

  const clearAllBacklogFilters = () => {
    setBacklogFilters({ projectIds: [], priorities: [], assigneeIds: [], statuses: [] });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-64"></div>
            <div className="h-4 bg-muted rounded w-96"></div>
          </div>
        </div>
      </div>
    );
  }

  // Show backlog even when no sprints exist
  const showNoSprintsMessage = sprints.length === 0;

  return (
    <>
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-[960px] mx-auto">
        {/* Page Header - outside zones */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-foreground">Sprints</h2>
            {activeSprints.length > 0 && (
              <Badge variant="secondary">
                {activeSprints.length} active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Across all projects</p>
        </div>

        {/* Active Sprints Zone - elevated container */}
        <div className="bg-card border border-border shadow-sm rounded-lg sm:rounded-xl mb-8">
          {/* Sticky header */}
          <div className="sticky top-[65px] z-20 bg-card border-b border-border rounded-t-lg sm:rounded-t-xl px-4 sm:px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">Active Sprints</h3>
                <span className="text-sm text-muted-foreground">
                  &middot; {activeSprints.length + completedSprints.length}
                </span>
              </div>
              <Button variant="emphasis" className="rounded-lg px-5 gap-2 font-semibold" onClick={handleOpenCreateDialog}>
                <Plus className="h-4 w-4" />
                New Sprint
              </Button>
            </div>
          </div>

          {/* Sprint content */}
          <div className="p-4 sm:p-5 space-y-2">
              {/* No Sprints Message */}
              {showNoSprintsMessage ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h4 className="text-lg font-medium text-foreground mb-1">No sprints found</h4>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Create your first sprint to start planning your work.
                  </p>
                </div>
              ) : (
                <>
                  {/* Active Sprint Cards */}
                  {activeSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      isActive
                      isExpanded={expandedSprintIds.has(sprint.id)}
                      moveTargets={activeSprints.filter((s) => s.id !== sprint.id)}
                      onToggleExpand={toggleSprintExpanded}
                      onEdit={handleOpenEditDialog}
                      onClose={handleOpenCloseDialog}
                      onAddTask={handleOpenTaskDrawer}
                      onMoveTask={handleMoveTask}
                      onTaskClick={setEditingTask}
                    />
                  ))}

              {/* Completed Sprints - if any */}
              {completedSprints.length > 0 && (
                <>
                  <div className="pt-6 mt-6 border-t border-border">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Completed</h4>
                  </div>
                  {completedSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      isActive={false}
                      isExpanded={expandedSprintIds.has(sprint.id)}
                      moveTargets={activeSprints.filter((s) => s.id !== sprint.id)}
                      onToggleExpand={toggleSprintExpanded}
                      onEdit={handleOpenEditDialog}
                      onMoveTask={handleMoveTask}
                      onTaskClick={setEditingTask}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

        {/* Backlog Zone - flat, no elevation */}
        <div className="mb-8">
          {/* Sticky header */}
          <div className="sticky top-[65px] z-20 bg-background border-b border-border pb-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {sortedFilteredBacklog.length > 0 && (
                  <Checkbox
                    className="flex-shrink-0"
                    checked={selectedTaskIds.size > 0 && selectedTaskIds.size === sortedFilteredBacklog.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTaskIds(new Set(sortedFilteredBacklog.map((t) => t.id)));
                      } else {
                        setSelectedTaskIds(new Set());
                      }
                    }}
                    aria-label="Select all backlog tasks"
                  />
                )}
                <Archive className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Backlog</h3>
                <span className="text-sm text-muted-foreground">
                  &middot; {hasActiveFilters ? `${sortedFilteredBacklog.length} of ${backlogTasks.length}` : backlogTasks.length}
                </span>
              </div>
              <button
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => handleOpenTaskDrawer(null)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mt-3 pb-3 border-b border-border/50">
            {/* Project filter */}
            <Select
              value={backlogFilters.projectIds.length === 1 ? backlogFilters.projectIds[0] : undefined}
              onValueChange={(value) => {
                if (value === '__all__') {
                  setBacklogFilters((prev) => ({ ...prev, projectIds: [] }));
                } else {
                  toggleBacklogFilter('projectIds', value);
                }
              }}
            >
              <SelectTrigger className={cn("h-8 w-[130px] text-xs", backlogFilters.projectIds.length > 0 && "ring-2 ring-primary/30 border-primary/50")}>
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority filter */}
            <Select
              value={backlogFilters.priorities.length === 1 ? backlogFilters.priorities[0] : undefined}
              onValueChange={(value) => {
                if (value === '__all__') {
                  setBacklogFilters((prev) => ({ ...prev, priorities: [] }));
                } else {
                  toggleBacklogFilter('priorities', value);
                }
              }}
            >
              <SelectTrigger className={cn("h-8 w-[110px] text-xs", backlogFilters.priorities.length > 0 && "ring-2 ring-primary/30 border-primary/50")}>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Priorities</SelectItem>
                <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
              </SelectContent>
            </Select>

            {/* Assignee filter */}
            <Select
              value={backlogFilters.assigneeIds.length === 1 ? backlogFilters.assigneeIds[0] : undefined}
              onValueChange={(value) => {
                if (value === '__all__') {
                  setBacklogFilters((prev) => ({ ...prev, assigneeIds: [] }));
                } else {
                  toggleBacklogFilter('assigneeIds', value);
                }
              }}
            >
              <SelectTrigger className={cn("h-8 w-[130px] text-xs", backlogFilters.assigneeIds.length > 0 && "ring-2 ring-primary/30 border-primary/50")}>
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Assignees</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={backlogFilters.statuses.length === 1 ? backlogFilters.statuses[0] : undefined}
              onValueChange={(value) => {
                if (value === '__all__') {
                  setBacklogFilters((prev) => ({ ...prev, statuses: [] }));
                } else {
                  toggleBacklogFilter('statuses', value);
                }
              }}
            >
              <SelectTrigger className={cn("h-8 w-[110px] text-xs", backlogFilters.statuses.length > 0 && "ring-2 ring-primary/30 border-primary/50")}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
                <SelectItem value="blocked">{STATUS_LABELS.blocked}</SelectItem>
                <SelectItem value="review">{STATUS_LABELS.review}</SelectItem>
                <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
              </SelectContent>
            </Select>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Sort controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Select value={backlogSortBy} onValueChange={(v) => setBacklogSortBy(v as typeof backlogSortBy)}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="assignee">Assignee</SelectItem>
                  <SelectItem value="createdAt">Date created</SelectItem>
                  <SelectItem value="dueDate">Due date</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setBacklogSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
              >
                {backlogSortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {backlogFilters.projectIds.map((pid) => {
                const project = projects.find((p) => p.id === pid);
                return (
                  <button
                    key={`project-${pid}`}
                    onClick={() => removeBacklogFilter('projectIds', pid)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
                  >
                    {project?.name || 'Unknown'}
                    <X className="h-3 w-3" />
                  </button>
                );
              })}
              {backlogFilters.priorities.map((p) => (
                <button
                  key={`priority-${p}`}
                  onClick={() => removeBacklogFilter('priorities', p)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
                >
                  {PRIORITY_LABELS[p as keyof typeof PRIORITY_LABELS] || p}
                  <X className="h-3 w-3" />
                </button>
              ))}
              {backlogFilters.assigneeIds.map((uid) => {
                const user = users.find((u) => u.id === uid);
                return (
                  <button
                    key={`assignee-${uid}`}
                    onClick={() => removeBacklogFilter('assigneeIds', uid)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
                  >
                    {user?.displayName || 'Unknown'}
                    <X className="h-3 w-3" />
                  </button>
                );
              })}
              {backlogFilters.statuses.map((s) => (
                <button
                  key={`status-${s}`}
                  onClick={() => removeBacklogFilter('statuses', s)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
                >
                  {STATUS_LABELS[s as keyof typeof STATUS_LABELS] || s}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                onClick={clearAllBacklogFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Bulk Action Bar - visible when tasks selected */}
          {selectedTaskIds.size > 0 && (
            <div className="mt-3 flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
              {/* Selection count */}
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                {selectedTaskIds.size} selected
              </span>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>

              <div className="h-4 w-px bg-border mx-1" />

              {/* Assign to sprint */}
              <Select
                value={undefined}
                onValueChange={async (value) => {
                  const sprintId = value === '__backlog__' ? null : value;
                  const sprintName = value === '__backlog__' ? 'Backlog' : activeSprints.find((s) => s.id === value)?.name || 'sprint';
                  try {
                    await apiPut('/tasks/bulk-update', {
                      taskIds: Array.from(selectedTaskIds),
                      fields: { sprintId },
                    });
                    toast.success(`Moved ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''} to ${sprintName}`);
                    setSelectedTaskIds(new Set());
                    await fetchAllData();
                  } catch (err) {
                    console.error('Bulk sprint assignment failed:', err);
                    toast.error('Failed to move tasks');
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Assign to sprint..." />
                </SelectTrigger>
                <SelectContent>
                  {currentSprints.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active</div>
                      {currentSprints.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-interactive flex-shrink-0" />
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {futureSprints.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</div>
                      {futureSprints.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {pastSprints.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ended</div>
                      {pastSprints.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {(currentSprints.length > 0 || futureSprints.length > 0 || pastSprints.length > 0) && (
                    <div className="border-t border-border my-1" />
                  )}
                  <SelectItem value="__backlog__">
                    <span className="flex items-center gap-1.5">
                      <Archive className="h-3 w-3" />
                      Backlog
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Set priority */}
              <Select
                value={undefined}
                onValueChange={async (value) => {
                  try {
                    await apiPut('/tasks/bulk-update', {
                      taskIds: Array.from(selectedTaskIds),
                      fields: { priority: value },
                    });
                    toast.success(`Updated priority to ${PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS]} for ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''}`);
                    setSelectedTaskIds(new Set());
                    await fetchAllData();
                  } catch (err) {
                    console.error('Bulk priority update failed:', err);
                    toast.error('Failed to update priority');
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Set priority..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                  <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                  <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                  <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                </SelectContent>
              </Select>

              {/* Assign to person */}
              <Select
                value={undefined}
                onValueChange={async (value) => {
                  const userName = users.find((u) => u.id === value)?.displayName || 'user';
                  try {
                    const taskIds = Array.from(selectedTaskIds);
                    await Promise.all(
                      taskIds.map((taskId) =>
                        apiPut(`/tasks/${taskId}`, { assigneeIds: [value] })
                      )
                    );
                    toast.success(`Assigned ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''} to ${userName}`);
                    setSelectedTaskIds(new Set());
                    await fetchAllData();
                  } catch (err) {
                    console.error('Bulk assignee update failed:', err);
                    toast.error('Failed to assign tasks');
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Backlog content */}
          <div className="mt-3">
            {backlogTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Archive className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h4 className="text-lg font-medium text-foreground mb-1">Backlog is empty</h4>
                <p className="text-sm text-muted-foreground max-w-sm">
                  All tasks are assigned to sprints or left unassigned.
                </p>
              </div>
            ) : sortedFilteredBacklog.length === 0 && hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">No tasks match the current filters</p>
                <button
                  onClick={clearAllBacklogFilters}
                  className="text-sm text-primary hover:underline mt-1"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="border rounded-md divide-y bg-card">
                {sortedFilteredBacklog.map((task) => (
                  <div key={task.id} className="group flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setEditingTask(task)}>
                    {/* Checkbox */}
                    <Checkbox
                      className={cn("flex-shrink-0", selectedTaskIds.size === 0 && "opacity-0 group-hover:opacity-100 transition-opacity")}
                      checked={selectedTaskIds.has(task.id)}
                      onCheckedChange={(checked) => {
                        setSelectedTaskIds((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(task.id);
                          } else {
                            next.delete(task.id);
                          }
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${task.title}`}
                    />

                    {/* Priority indicator dot */}
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getPriorityDotColor(task.priority))} title={task.priority} />

                    {/* Title */}
                    <span className="flex-1 truncate font-medium text-foreground" title={task.title}>
                      {task.title}
                    </span>

                    {/* Assignee avatars - stacked, max 3 + overflow */}
                    {task.assignees && task.assignees.length > 0 && (
                      <div className="flex -space-x-1.5 flex-shrink-0">
                        {task.assignees.slice(0, 3).map((assignee) => (
                          <div
                            key={assignee.id}
                            className={cn(
                              'h-6 w-6 rounded-full text-white text-[10px] font-medium flex items-center justify-center border-2 border-background ring-1 ring-border/50',
                              getAvatarColor(assignee.id || assignee.userId)
                            )}
                            title={assignee.user?.displayName}
                          >
                            {assignee.user?.displayName?.[0]?.toUpperCase() || '?'}
                          </div>
                        ))}
                        {task.assignees.length > 3 && (
                          <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-medium flex items-center justify-center border-2 border-background">
                            +{task.assignees.length - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status badge */}
                    <span className={cn(getStatusPillClasses(task.status), 'flex-shrink-0')}>
                      {formatStatusLabel(task.status)}
                    </span>

                    {/* Due date */}
                    {task.dueDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                        <Calendar className="h-3 w-3" />
                        {formatDate(task.dueDate)}
                      </span>
                    )}

                    {/* Sprint assignment */}
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={undefined}
                        onValueChange={(value) => {
                          if (value === '__backlog__') {
                            handleMoveTask(task.id, null);
                          } else {
                            const sprint = activeSprints.find((s) => s.id === value);
                            handleMoveTask(task.id, value, sprint?.name);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue placeholder="Assign sprint..." />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Active sprints - visually distinguished */}
                          {currentSprints.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active</div>
                              {currentSprints.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-interactive flex-shrink-0" />
                                    {s.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {/* Future sprints - chronological */}
                          {futureSprints.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</div>
                              {futureSprints.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {/* Ended - active sprints past their end date, not yet closed */}
                          {pastSprints.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ended</div>
                              {pastSprints.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {/* Backlog option - always present at bottom */}
                          {(currentSprints.length > 0 || futureSprints.length > 0 || pastSprints.length > 0) && (
                            <div className="border-t border-border my-1" />
                          )}
                          <SelectItem value="__backlog__">
                            <span className="flex items-center gap-1.5">
                              <Archive className="h-3 w-3" />
                              Backlog
                            </span>
                          </SelectItem>
                          {currentSprints.length === 0 && futureSprints.length === 0 && pastSprints.length === 0 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No active sprints</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Sprint dialogs */}
    <CreateSprintDialog
      open={showCreateDialog}
      onOpenChange={setShowCreateDialog}
      name={newSprintName}
      onNameChange={setNewSprintName}
      description={newSprintDescription}
      onDescriptionChange={setNewSprintDescription}
      startDate={newSprintStartDate}
      onStartDateChange={setNewSprintStartDate}
      endDate={newSprintEndDate}
      onEndDateChange={setNewSprintEndDate}
      error={createError}
      onCancel={() => { setShowCreateDialog(false); setCreateError(''); }}
      onCreate={handleCreateSprint}
    />

    <EditSprintDialog
      open={showEditDialog}
      onOpenChange={setShowEditDialog}
      name={editName}
      onNameChange={setEditName}
      description={editDescription}
      onDescriptionChange={setEditDescription}
      startDate={editStartDate}
      onStartDateChange={setEditStartDate}
      endDate={editEndDate}
      onEndDateChange={setEditEndDate}
      error={editError}
      onCancel={() => { setShowEditDialog(false); setEditError(''); }}
      onSave={handleSaveEdit}
    />

    <CloseSprintDialog
      open={showCloseDialog}
      onOpenChange={setShowCloseDialog}
      closingSprint={closingSprint}
      otherActive={closingSprint ? activeSprints.filter((s) => s.id !== closingSprint.id) : []}
      closeAction={closeAction}
      onCloseActionChange={setCloseAction}
      closeNextSprintId={closeNextSprintId}
      onCloseNextSprintIdChange={setCloseNextSprintId}
      error={closeError}
      loading={closeLoading}
      onCancel={() => { setShowCloseDialog(false); setClosingSprint(null); }}
      onConfirm={handleCloseSprint}
    />

    {/* Task Create Drawer */}
    {showTaskDrawer && (
      <TaskDrawer
        mode="create"
        defaultSprintId={drawerSprintId}
        onSave={() => {
          setShowTaskDrawer(false);
          fetchAllData();
        }}
        onClose={() => setShowTaskDrawer(false)}
      />
    )}

    {/* Task Edit Drawer */}
    {editingTask && (
      <TaskDrawer
        mode="edit"
        task={editingTask}
        onSave={() => {
          setEditingTask(null);
          fetchAllData();
        }}
        onClose={() => {
          setEditingTask(null);
          fetchAllData();
        }}
      />
    )}
    </>
  );
}
