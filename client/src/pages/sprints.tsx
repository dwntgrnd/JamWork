
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, getErrorMessage } from '@/lib/api';
import { Sprint, Task, Project, UserSummary, STATUS_LABELS, PRIORITY_LABELS } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Check, ChevronDown, ChevronRight, ArrowRight, Archive, Plus, Pencil, X, ArrowUp, ArrowDown } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { getStatusPillClasses, formatStatusLabel, getPriorityDotColor } from '@/lib/style-tokens';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { TaskDrawer } from '@/components/task-drawer';

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

  const formatDateRange = (startDate: Date | string, endDate: Date | string): string => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const formatDate = (date: Date | string): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group tasks by project
  const groupTasksByProject = (tasks: (Task & { project?: { id: string; name: string } })[]) => {
    const groups: Record<string, { projectName: string; tasks: Task[] }> = {};
    for (const task of tasks) {
      const pid = task.project?.id || 'unknown';
      const pname = task.project?.name || 'Unknown Project';
      if (!groups[pid]) groups[pid] = { projectName: pname, tasks: [] };
      groups[pid].tasks.push(task);
    }
    return Object.values(groups);
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
                  {activeSprints.map((sprint) => {
                    const isExpanded = expandedSprintIds.has(sprint.id);
                    const totalTasks = sprint.stats?.taskCount ?? sprint._count?.tasks ?? sprint.tasks?.length ?? 0;
                    const completedTasks = sprint.stats?.completedCount ?? sprint.tasks?.filter((t) => t.status === 'done').length ?? 0;
                    const projectGroups = sprint.tasks ? groupTasksByProject(sprint.tasks) : [];
                    const otherActiveSprints = activeSprints.filter((s) => s.id !== sprint.id);

                    return (
                      <Card key={sprint.id} className="px-3 py-2.5 group">
                    <div
                      className="flex items-start gap-2 cursor-pointer select-none"
                      onClick={() => toggleSprintExpanded(sprint.id)}
                    >
                      {/* Chevron */}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: name + badge + project + edit icon */}
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {sprint.name}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-interactive/15 text-interactive-foreground font-medium whitespace-nowrap flex-shrink-0">
                            Active
                          </span>
                          {sprint.project && (
                            <span className="text-xs text-muted-foreground truncate flex-shrink-0">
                              {sprint.project.name}
                            </span>
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDialog(sprint);
                            }}
                            aria-label={`Edit ${sprint.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCloseDialog(sprint);
                            }}
                            aria-label={`Close ${sprint.name}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Close
                          </button>
                        </div>
                        {/* Line 2: dates + count + progress */}
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 flex-shrink-0" />
                          <span>{formatDateRange(sprint.startDate, sprint.endDate)}</span>
                          <span>&middot;</span>
                          <span>{totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</span>
                          <span>&middot;</span>
                          <span>{completedTasks} of {totalTasks} complete</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Task View */}
                    {isExpanded && (
                      <div className="mt-3 ml-6">
                        {sprint.description && (
                          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                            {sprint.description}
                          </p>
                        )}
                        {projectGroups.length === 0 ? (
                          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                            <span>No tasks in this sprint</span>
                            <span>&middot;</span>
                            <button
                              className="text-primary hover:underline font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTaskDrawer(sprint.id);
                              }}
                            >
                              Add task
                            </button>
                          </div>
                        ) : (
                          <>
                          <div className="space-y-4">
                          {projectGroups.map((group) => (
                            <div key={group.projectName} className="space-y-2">
                              <h5 className="text-sm font-medium text-foreground">
                                {group.projectName} ({group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'})
                              </h5>
                              <div className="border rounded-md divide-y bg-card">
                                {group.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => setEditingTask(task)}
                                  >
                                    <span
                                      className={cn(
                                        'w-2 h-2 rounded-full flex-shrink-0',
                                        task.priority === 'urgent' && 'bg-priority-urgent',
                                        task.priority === 'high' && 'bg-priority-high',
                                        task.priority === 'medium' && 'bg-priority-medium',
                                        task.priority === 'low' && 'bg-priority-low'
                                      )}
                                    />
                                    <span className="flex-1 truncate text-foreground" title={task.title}>
                                      {task.title}
                                    </span>
                                    {task.assignees && task.assignees.length > 0 && (
                                      <div className="flex -space-x-1.5 shrink-0">
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
                                    <span className={cn(getStatusPillClasses(task.status), 'shrink-0')}>
                                      {formatStatusLabel(task.status)}
                                    </span>
                                    {task.dueDate && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 whitespace-nowrap">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(task.dueDate)}
                                      </span>
                                    )}
                                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Select
                                      value={undefined}
                                      onValueChange={(value) => {
                                        if (value === '__backlog__') {
                                          handleMoveTask(task.id, null);
                                        } else {
                                          const targetSprint = otherActiveSprints.find((s) => s.id === value);
                                          handleMoveTask(task.id, value, targetSprint?.name);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-7 w-36 text-xs shrink-0">
                                        <SelectValue placeholder="Move to..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__backlog__">
                                          <span className="flex items-center gap-1">
                                            <ArrowRight className="h-3 w-3" /> Backlog
                                          </span>
                                        </SelectItem>
                                        {otherActiveSprints.map((s) => (
                                          <SelectItem key={s.id} value={s.id}>
                                            <span className="flex items-center gap-1">
                                              <ArrowRight className="h-3 w-3" /> {s.name}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          </div>
                          <button
                            className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenTaskDrawer(sprint.id);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add task
                          </button>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* Completed Sprints - if any */}
              {completedSprints.length > 0 && (
                <>
                  <div className="pt-6 mt-6 border-t border-border">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Completed</h4>
                  </div>
                  {completedSprints.map((sprint) => {
                    const isExpanded = expandedSprintIds.has(sprint.id);
                    const totalTasks = sprint.stats?.taskCount ?? sprint._count?.tasks ?? sprint.tasks?.length ?? 0;
                    const projectGroups = sprint.tasks ? groupTasksByProject(sprint.tasks) : [];
                    const otherActiveSprints = activeSprints.filter((s) => s.id !== sprint.id);

                    return (
                      <Card key={sprint.id} className="px-3 py-2.5 opacity-75 hover:opacity-100 transition-opacity group">
                    <div
                      className="flex items-start gap-2 cursor-pointer select-none"
                      onClick={() => toggleSprintExpanded(sprint.id)}
                    >
                      {/* Chevron */}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: name + badge + project + edit icon */}
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {sprint.name}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap flex-shrink-0">
                            Completed
                          </span>
                          {sprint.project && (
                            <span className="text-xs text-muted-foreground truncate flex-shrink-0">
                              {sprint.project.name}
                            </span>
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDialog(sprint);
                            }}
                            aria-label={`Edit ${sprint.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                        {/* Line 2: dates + count */}
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 flex-shrink-0" />
                          <span>{formatDateRange(sprint.startDate, sprint.endDate)}</span>
                          <span>&middot;</span>
                          <span>{totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Task View */}
                    {isExpanded && (
                      <div className="mt-3 ml-6">
                        {sprint.description && (
                          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                            {sprint.description}
                          </p>
                        )}
                        {projectGroups.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No tasks in this sprint</p>
                        ) : (
                          <div className="space-y-4">
                          {projectGroups.map((group) => (
                            <div key={group.projectName} className="space-y-2">
                              <h5 className="text-sm font-medium text-foreground">
                                {group.projectName} ({group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'})
                              </h5>
                              <div className="border rounded-md divide-y bg-card">
                                {group.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => setEditingTask(task)}
                                  >
                                    <span
                                      className={cn(
                                        'w-2 h-2 rounded-full flex-shrink-0',
                                        task.priority === 'urgent' && 'bg-priority-urgent',
                                        task.priority === 'high' && 'bg-priority-high',
                                        task.priority === 'medium' && 'bg-priority-medium',
                                        task.priority === 'low' && 'bg-priority-low'
                                      )}
                                    />
                                    <span className="flex-1 truncate text-foreground" title={task.title}>
                                      {task.title}
                                    </span>
                                    {task.assignees && task.assignees.length > 0 && (
                                      <div className="flex -space-x-1.5 shrink-0">
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
                                    <span className={cn(getStatusPillClasses(task.status), 'shrink-0')}>
                                      {formatStatusLabel(task.status)}
                                    </span>
                                    {task.dueDate && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 whitespace-nowrap">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(task.dueDate)}
                                      </span>
                                    )}
                                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Select
                                      value={undefined}
                                      onValueChange={(value) => {
                                        if (value === '__backlog__') {
                                          handleMoveTask(task.id, null);
                                        } else {
                                          const targetSprint = otherActiveSprints.find((s) => s.id === value);
                                          handleMoveTask(task.id, value, targetSprint?.name);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-7 w-36 text-xs shrink-0">
                                        <SelectValue placeholder="Move to..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__backlog__">
                                          <span className="flex items-center gap-1">
                                            <ArrowRight className="h-3 w-3" /> Backlog
                                          </span>
                                        </SelectItem>
                                        {otherActiveSprints.map((s) => (
                                          <SelectItem key={s.id} value={s.id}>
                                            <span className="flex items-center gap-1">
                                              <ArrowRight className="h-3 w-3" /> {s.name}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
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
                  {(currentSprints.length > 0 || futureSprints.length > 0) && (
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
                          {/* Backlog option - always present at bottom */}
                          {(currentSprints.length > 0 || futureSprints.length > 0) && (
                            <div className="border-t border-border my-1" />
                          )}
                          <SelectItem value="__backlog__">
                            <span className="flex items-center gap-1.5">
                              <Archive className="h-3 w-3" />
                              Backlog
                            </span>
                          </SelectItem>
                          {currentSprints.length === 0 && futureSprints.length === 0 && (
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

    {/* Create Sprint Dialog */}
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Sprint</DialogTitle>
          <DialogDescription>
            Create a new sprint to organize tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-sprint-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-sprint-name"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              placeholder="Sprint name"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-sprint-desc">Description</Label>
            <Textarea
              id="new-sprint-desc"
              value={newSprintDescription}
              onChange={(e) => setNewSprintDescription(e.target.value)}
              placeholder="Sprint goals or context (optional)"
              maxLength={500}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{newSprintDescription.length}/500</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-start-date">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-start-date"
                type="date"
                value={newSprintStartDate}
                onChange={(e) => setNewSprintStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-end-date">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-end-date"
                type="date"
                value={newSprintEndDate}
                onChange={(e) => setNewSprintEndDate(e.target.value)}
              />
            </div>
          </div>

          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCreateDialog(false);
              setCreateError('');
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateSprint}>
            Create Sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit Sprint Dialog */}
    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Sprint</DialogTitle>
          <DialogDescription>Update sprint details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-name">Name <span className="text-destructive">*</span></Label>
            <Input id="edit-sprint-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Sprint name" maxLength={100} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-desc">Description</Label>
            <Textarea id="edit-sprint-desc" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Sprint goals or context (optional)" maxLength={500} rows={3} className="resize-none" />
            <p className="text-xs text-muted-foreground text-right">{editDescription.length}/500</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start-date">Start Date <span className="text-destructive">*</span></Label>
              <Input id="edit-start-date" type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end-date">End Date <span className="text-destructive">*</span></Label>
              <Input id="edit-end-date" type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
            </div>
          </div>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditError(''); }}>Cancel</Button>
          <Button onClick={handleSaveEdit}>Update Sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Close Sprint Dialog */}
    <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close sprint</DialogTitle>
          <DialogDescription>
            {closingSprint && (() => {
              const incompleteTasks = (closingSprint.tasks || []).filter((t) => t.status !== 'done');
              if (incompleteTasks.length === 0) {
                return `All tasks are complete. Close this sprint?`;
              }
              return `${closingSprint.name} has ${incompleteTasks.length} incomplete task${incompleteTasks.length === 1 ? '' : 's'}. Choose where to move them.`;
            })()}
          </DialogDescription>
        </DialogHeader>

        {closingSprint && (() => {
          const allTasks = closingSprint.tasks || [];
          const incompleteTasks = allTasks.filter((t) => t.status !== 'done');
          const completedCount = allTasks.filter((t) => t.status === 'done').length;
          const otherActive = activeSprints.filter((s) => s.id !== closingSprint.id);
          const selectedSprintName = otherActive.find((s) => s.id === closeNextSprintId)?.name;

          if (incompleteTasks.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                All {allTasks.length} task{allTasks.length === 1 ? '' : 's'} in this sprint are marked as done.
              </p>
            );
          }

          return (
            <div className="space-y-4">
              {/* Incomplete task list */}
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {incompleteTasks.map((task, idx) => (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm',
                      idx < incompleteTasks.length - 1 && 'border-b'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getPriorityDotColor(task.priority))} />
                    <span className="flex-1 truncate text-foreground">{task.title}</span>
                    <span className={cn(getStatusPillClasses(task.status), 'flex-shrink-0')}>
                      {formatStatusLabel(task.status)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Radio group */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Move incomplete tasks to:</Label>
                <RadioGroup value={closeAction} onValueChange={(v) => setCloseAction(v as 'backlog' | 'next_sprint')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="backlog" id="close-backlog" />
                    <Label htmlFor="close-backlog" className="cursor-pointer">
                      <span className="text-sm font-medium">Backlog</span>
                      <span className="text-xs text-muted-foreground ml-2">Remove sprint assignment</span>
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="next_sprint"
                        id="close-next-sprint"
                        disabled={otherActive.length === 0}
                      />
                      <Label htmlFor="close-next-sprint" className={cn("cursor-pointer", otherActive.length === 0 && "opacity-50")}>
                        <span className="text-sm font-medium">Move to sprint</span>
                        {otherActive.length === 0 && (
                          <span className="text-xs text-muted-foreground ml-2">No other active sprints</span>
                        )}
                      </Label>
                    </div>
                    {closeAction === 'next_sprint' && otherActive.length > 0 && (
                      <div className="ml-6">
                        <Select value={closeNextSprintId || undefined} onValueChange={setCloseNextSprintId}>
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="Select a sprint..." />
                          </SelectTrigger>
                          <SelectContent>
                            {otherActive.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </div>

              {/* Summary */}
              <div className="bg-muted rounded-md p-3">
                <p className="text-sm text-muted-foreground">
                  {completedCount} completed task{completedCount === 1 ? '' : 's'} will stay in this sprint's history. {incompleteTasks.length} incomplete task{incompleteTasks.length === 1 ? '' : 's'} will be moved to {closeAction === 'backlog' ? 'backlog' : (selectedSprintName || 'the selected sprint')}.
                </p>
              </div>
            </div>
          );
        })()}

        {closeError && <p className="text-sm text-destructive">{closeError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowCloseDialog(false); setClosingSprint(null); }}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleCloseSprint} disabled={closeLoading}>
            {closeLoading ? 'Closing...' : 'Close sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
