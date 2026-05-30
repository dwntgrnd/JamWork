
import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Task, Sprint, Milestone, Project, UserSummary, STATUS_LABELS, TaskFilterState, TaskStatus } from '@/types';
import { getPriorityDotColor } from '@/lib/style-tokens';
import { getDateUrgencyInfo, parseLocalDate, startOfLocalDay } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { TaskDrawer } from '@/components/task-drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Label as FormLabel } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, ChevronDown, Target, GanttChart, Diamond, Plus, Edit2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { isOverdue } from '@/lib/date-utils';
import { toast } from 'sonner';

type ZoomLevel = 'day' | 'week' | 'month';

interface TimelineViewProps {
  projectId?: string;
  filters?: TaskFilterState;
}

const SPRINT_COLORS = [
  'bg-sprint-lane-1',
  'bg-sprint-lane-2',
  'bg-sprint-lane-3',
  'bg-sprint-lane-4',
  'bg-sprint-lane-5',
  'bg-sprint-lane-6',
];

const formatShortDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const TimelineViewComponent = ({ projectId, filters }: TimelineViewProps) => {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [dateOffset, setDateOffset] = useState(0);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Horizontal scroll container, so we can center the "today" line on open / Today click.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasCenteredRef = useRef(false);
  const [recenterNonce, setRecenterNonce] = useState(0);

  // Milestone management state
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deleteMilestoneId, setDeleteMilestoneId] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ name: '', date: '' });
  const [milestoneError, setMilestoneError] = useState('');

  // Collapsed project groups (global mode only). Ephemeral — not persisted.
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set());

  const toggleProjectCollapsed = (projId: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) {
        next.delete(projId);
      } else {
        next.add(projId);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Build query params based on whether projectId is provided
      const projectQuery = projectId ? `?projectId=${projectId}` : '';

      // Fetch all data in parallel
      // Note: sprints and milestones are global — they represent shared resource
      // cycles and organizational roadmap markers, and every project sees the same
      // set. Only tasks are project-scoped.
      const [tasksData, milestonesData, sprintsData, currentUserData, projectsData] = await Promise.all([
        apiGet<{ tasks: Task[] }>(`/tasks${projectQuery}`),
        apiGet<{ milestones: Milestone[] }>('/milestones'),
        apiGet<{ sprints: Sprint[] }>('/sprints'),
        apiGet<{ user: UserSummary }>('/auth/me'),
        apiGet<{ projects: Project[] }>('/projects'),
      ]);

      // Filter tasks that have at least a due date or start date
      const tasksWithDates = tasksData.tasks.filter(
        (task) => task.dueDate || task.startDate
      );

      setTasks(tasksWithDates);
      setProjects(projectsData.projects);
      setMilestones(milestonesData.milestones);
      setSprints(sprintsData.sprints);
      setCurrentUserId(currentUserData.user.id);
    } catch (err) {
      console.error('Failed to fetch timeline data:', err);
      toast.error('Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  };

  // Milestone CRUD handlers
  const handleOpenCreateMilestone = () => {
    setEditingMilestone(null);
    setMilestoneForm({ name: '', date: '' });
    setMilestoneError('');
    setShowMilestoneDialog(true);
  };

  const handleOpenEditMilestone = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneForm({
      name: milestone.name,
      date: new Date(milestone.date).toISOString().split('T')[0],
    });
    setMilestoneError('');
    setShowMilestoneDialog(true);
  };

  const handleSaveMilestone = async () => {
    if (!milestoneForm.name.trim()) {
      setMilestoneError('Milestone name is required');
      return;
    }

    if (milestoneForm.name.length > 100) {
      setMilestoneError('Milestone name must be 100 characters or less');
      return;
    }

    if (!milestoneForm.date) {
      setMilestoneError('Date is required');
      return;
    }

    try {
      setMilestoneError('');

      if (editingMilestone) {
        // Update existing milestone
        await apiPut(`/milestones/${editingMilestone.id}`, {
          name: milestoneForm.name.trim(),
          date: milestoneForm.date,
        });
      } else {
        await apiPost('/milestones', {
          name: milestoneForm.name.trim(),
          date: milestoneForm.date,
          ...(projectId && { projectId }),
        });
      }

      setShowMilestoneDialog(false);
      fetchData(); // Refresh all data including milestones
    } catch (err: any) {
      setMilestoneError(err.message || 'Failed to save milestone');
    }
  };

  const handleDeleteMilestone = async () => {
    if (!deleteMilestoneId) return;

    try {
      await apiDelete(`/milestones/${deleteMilestoneId}`);
      setDeleteMilestoneId(null);
      fetchData(); // Refresh all data including milestones
    } catch (err) {
      console.error('Failed to delete milestone:', err);
    }
  };

  // Apply filters to tasks
  const filteredTasks = tasks.filter((task) => {
    // Status filter
    if (filters?.status && task.status !== filters.status) return false;

    // Priority filter
    if (filters?.priority && task.priority !== filters.priority) return false;

    // Assignee filter
    if (filters?.assigneeId) {
      if (filters.assigneeId === 'me') {
        if (!task.assignees?.some((a) => a.userId === currentUserId)) return false;
      } else {
        if (!task.assignees?.some((a) => a.userId === filters.assigneeId)) return false;
      }
    }

    // Show completed filter
    if (!filters?.showCompleted && task.status === 'done') return false;

    return true;
  });

  // Build grouped rows for global timeline
  type TimelineRow =
    | { type: 'project'; project: Project }
    | { type: 'task'; task: Task };

  const isGlobal = !projectId;

  const timelineRows: TimelineRow[] = (() => {
    if (!isGlobal) {
      return filteredTasks.map((task) => ({ type: 'task' as const, task }));
    }

    // Group tasks by project
    const projectMap = new Map<string, Task[]>();
    const noProjectTasks: Task[] = [];

    filteredTasks.forEach((task) => {
      if (task.projectId) {
        const existing = projectMap.get(task.projectId) || [];
        existing.push(task);
        projectMap.set(task.projectId, existing);
      } else {
        noProjectTasks.push(task);
      }
    });

    const rows: TimelineRow[] = [];

    // Sort projects alphabetically and emit rows
    const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    for (const proj of sortedProjects) {
      const projectTasks = projectMap.get(proj.id);
      if (!projectTasks || projectTasks.length === 0) continue;
      rows.push({ type: 'project', project: proj });
      projectTasks.forEach((task) => rows.push({ type: 'task', task }));
    }

    // Tasks without a project
    noProjectTasks.forEach((task) => rows.push({ type: 'task', task }));

    return rows;
  })();

  // Apply collapse state: hide task rows whose parent project is collapsed.
  // Orphan tasks (no projectId) are always visible — they render after the last
  // project group and must not inherit the preceding project's collapsed state.
  const visibleRows: TimelineRow[] = (() => {
    if (!isGlobal) return timelineRows;
    const out: TimelineRow[] = [];
    let currentProjectCollapsed = false;
    for (const row of timelineRows) {
      if (row.type === 'project') {
        out.push(row);
        currentProjectCollapsed = collapsedProjectIds.has(row.project.id);
      } else {
        if (!row.task.projectId || !currentProjectCollapsed) {
          out.push(row);
        }
      }
    }
    return out;
  })();

  // Calculate date range
  const calculateDateRange = () => {
    const dates: Date[] = [];

    // Collect all dates from filtered tasks
    filteredTasks.forEach((task) => {
      if (task.startDate) dates.push(parseLocalDate(task.startDate));
      if (task.dueDate) dates.push(parseLocalDate(task.dueDate));
    });

    // Collect dates from projects (global mode)
    if (isGlobal) {
      projects.forEach((proj) => {
        if (proj.startDate) dates.push(parseLocalDate(proj.startDate));
        if (proj.endDate) dates.push(parseLocalDate(proj.endDate));
      });
    }

    // Collect all dates from milestones
    milestones.forEach((milestone) => {
      dates.push(parseLocalDate(milestone.date));
    });

    // Collect all dates from sprints
    sprints.forEach((sprint) => {
      dates.push(parseLocalDate(sprint.startDate));
      dates.push(parseLocalDate(sprint.endDate));
    });

    // Default range if no dates
    if (dates.length === 0) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(today);
      end.setDate(end.getDate() + 21);
      return { start, end };
    }

    // Find min and max dates
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Add padding based on zoom level
    const paddingDays = zoomLevel === 'day' ? 3 : zoomLevel === 'week' ? 7 : 30;
    minDate.setDate(minDate.getDate() - paddingDays);
    maxDate.setDate(maxDate.getDate() + paddingDays);

    return { start: minDate, end: maxDate };
  };

  const { start: rangeStart, end: rangeEnd } = calculateDateRange();

  // Apply date offset for navigation
  const adjustedStart = new Date(rangeStart);
  const adjustedEnd = new Date(rangeEnd);

  if (zoomLevel === 'day') {
    adjustedStart.setDate(adjustedStart.getDate() + dateOffset);
    adjustedEnd.setDate(adjustedEnd.getDate() + dateOffset);
  } else if (zoomLevel === 'week') {
    adjustedStart.setDate(adjustedStart.getDate() + dateOffset * 7);
    adjustedEnd.setDate(adjustedEnd.getDate() + dateOffset * 7);
  } else {
    adjustedStart.setMonth(adjustedStart.getMonth() + dateOffset);
    adjustedEnd.setMonth(adjustedEnd.getMonth() + dateOffset);
  }

  // Normalized local-midnight origin shared by columns, task bars, and the today line.
  // Anchoring everything to one start-of-day reference keeps them aligned and avoids
  // timezone/hour-of-day drift in the position math.
  const originStart = startOfLocalDay(adjustedStart);

  // Generate time columns based on zoom level
  const generateTimeColumns = () => {
    const columns: { date: Date; label: string }[] = [];
    const current = new Date(originStart);

    while (current <= adjustedEnd) {
      let label = '';
      const nextDate = new Date(current);

      if (zoomLevel === 'day') {
        label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (zoomLevel === 'week') {
        label = `Week of ${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        nextDate.setDate(nextDate.getDate() + 7);
      } else {
        label = current.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        nextDate.setMonth(nextDate.getMonth() + 1);
      }

      columns.push({ date: new Date(current), label });
      current.setTime(nextDate.getTime());
    }

    return columns;
  };

  const timeColumns = generateTimeColumns();

  // Calculate pixel width per day
  const pixelsPerDay = zoomLevel === 'day' ? 40 : zoomLevel === 'week' ? 120 / 7 : 120 / 30;
  const columnWidth = zoomLevel === 'day' ? 40 : zoomLevel === 'week' ? 120 : 120;

  // Month mode renders one fixed-width column per calendar month (variable day counts),
  // so positions must be measured in calendar months + fraction-through-the-month rather
  // than on the uniform day scale used by day/week mode. hourAccurate keeps the time of
  // day (for the live today line); bars pass false so they sit at the day boundary.
  const getMonthPosition = (d: Date, hourAccurate: boolean): number => {
    const monthsFromOrigin =
      (d.getFullYear() - originStart.getFullYear()) * 12 +
      (d.getMonth() - originStart.getMonth());
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    let dayPart = d.getDate() - 1;
    if (hourAccurate) {
      dayPart += (d.getHours() * 60 + d.getMinutes()) / (24 * 60);
    }
    return (monthsFromOrigin + dayPart / daysInMonth) * columnWidth;
  };

  // Calculate position for a date (day-granular: bars snap to whole columns).
  const getDatePosition = (date: Date | string): number => {
    if (zoomLevel === 'month') {
      return getMonthPosition(startOfLocalDay(date), false);
    }
    const daysSinceStart = Math.round(
      (startOfLocalDay(date).getTime() - originStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceStart * pixelsPerDay;
  };

  // Get today's position. Unlike task bars, the today line is NOT snapped to a day
  // boundary — keeping the time of day makes it hour-accurate within today's column.
  const today = new Date();
  const todayPosition =
    zoomLevel === 'month'
      ? getMonthPosition(today, true)
      : ((today.getTime() - originStart.getTime()) / (1000 * 60 * 60 * 24)) * pixelsPerDay;
  const isTodayVisible =
    today >= adjustedStart && today <= adjustedEnd;

  // Status colors for timeline bars (uses CSS variable tokens)
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'todo':
        return 'bg-status-todo-bg';
      case 'in_progress':
        return 'bg-status-in_progress-bg';
      case 'review':
        return 'bg-status-review-bg';
      case 'done':
        return 'bg-status-done-bg';
      default:
        return 'bg-status-todo-bg';
    }
  };

  // Handle date navigation
  const handleNavigateLeft = () => {
    setDateOffset((prev) => prev - 1);
  };

  const handleNavigateRight = () => {
    setDateOffset((prev) => prev + 1);
  };

  const handleToday = () => {
    setDateOffset(0);
    // Bump the nonce so re-centering fires even when dateOffset was already 0
    // (no state change would otherwise re-run the effect).
    setRecenterNonce((n) => n + 1);
  };

  // Scroll so the today line sits in the horizontal center of the viewport.
  const centerOnToday = () => {
    const container = scrollContainerRef.current;
    if (!container || !isTodayVisible) return;
    requestAnimationFrame(() => {
      container.scrollLeft = Math.max(0, todayPosition - container.clientWidth / 2);
    });
  };

  // Center once after the timeline data first loads.
  useLayoutEffect(() => {
    if (loading || hasCenteredRef.current) return;
    centerOnToday();
    hasCenteredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Re-center when the Today button is clicked.
  useEffect(() => {
    if (recenterNonce === 0) return;
    centerOnToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterNonce]);

  // Re-center whenever the zoom level changes (day / week / month). Left-right
  // navigation deliberately does not re-center.
  useEffect(() => {
    if (loading) return;
    centerOnToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading timeline...</div>
    );
  }

  if (filteredTasks.length === 0 && milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GanttChart className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No scheduled tasks</h3>
        <p className="text-sm text-muted-foreground max-w-sm">Add start or due dates to tasks to see them on the timeline.</p>
      </div>
    );
  }

  // Mobile: render simplified task list instead of CSS Grid timeline
  if (isMobile) {
    const renderMobileTaskCard = (task: Task) => (
      <div
        key={task.id}
        className="bg-card border rounded-lg p-3 space-y-1"
      >
        <div className="flex items-center gap-2">
          {getPriorityDotColor(task.priority) && (
            <div
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                getPriorityDotColor(task.priority)
              )}
            />
          )}
          <span
            className={cn(
              'text-sm font-medium text-foreground truncate flex-1',
              task.status === 'done' && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
            {STATUS_LABELS[task.status] || task.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-4">
          {task.startDate && task.dueDate ? (
            <span>{formatShortDate(task.startDate)} - {formatShortDate(task.dueDate)}</span>
          ) : task.dueDate ? (
            <span>Due: {formatShortDate(task.dueDate)}</span>
          ) : task.startDate ? (
            <span>Start: {formatShortDate(task.startDate)}</span>
          ) : null}
          {task.assignees && task.assignees.length > 0 && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span className="truncate">
                {task.assignees.map((a) => a.user?.displayName).filter(Boolean).join(', ')}
              </span>
            </>
          )}
        </div>
      </div>
    );

    return (
      <TooltipProvider>
        <div className="space-y-4 p-4">
          {/* Task list — grouped in global mode */}
          <div className="space-y-2">
            {isGlobal ? (
              timelineRows.map((row) =>
                row.type === 'project' ? (
                  <h3 key={`proj-${row.project.id}`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3 first:pt-0">
                    {row.project.name}
                  </h3>
                ) : (
                  renderMobileTaskCard(row.task)
                )
              )
            ) : (
              filteredTasks.map(renderMobileTaskCard)
            )}
          </div>

          {/* Milestones section */}
          {milestones.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Milestones</h3>
              {milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="flex items-center gap-2 bg-card border rounded-lg p-3"
                >
                  <Diamond className="h-4 w-4 text-info flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {milestone.name}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatShortDate(milestone.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  const totalWidth = timeColumns.length * columnWidth;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-4 p-4 bg-card border rounded-lg">
          {/* Time-scale controls */}
          <div className="flex items-center rounded-md border bg-muted p-0.5">
            {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-sm transition-colors',
                  zoomLevel === level
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {level === 'day' ? 'Day' : level === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleNavigateLeft}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              <Target className="h-4 w-4 mr-1" />
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleNavigateRight}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Add Milestone button */}
          <Button variant="outline" size="sm" onClick={handleOpenCreateMilestone}>
            <Plus className="h-4 w-4 mr-1" />
            Milestone
          </Button>

          {/* Status legend */}
          <div className="flex items-center gap-3 ml-auto">
            {[
              { label: 'To Do', color: 'bg-status-todo-bg' },
              { label: 'In Progress', color: 'bg-status-in_progress-bg' },
              { label: 'Review', color: 'bg-status-review-bg' },
              { label: 'Done', color: 'bg-status-done-bg' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className={cn('w-3 h-2 rounded-sm', item.color)} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="flex">
            {/* Fixed left column for task names */}
            <div className="w-60 flex-shrink-0 border-r bg-muted">
              {/* Header */}
              <div className="h-16 border-b p-3 bg-card">
                <div className="text-sm font-semibold text-foreground">Tasks</div>
              </div>

              {/* Milestone row header */}
              {milestones.length > 0 && (
                <div className="h-6 border-b px-3 flex items-center bg-info/10">
                  <div className="text-xs font-semibold text-info">
                    Milestones
                  </div>
                </div>
              )}

              {/* Task rows (grouped by project in global mode) */}
              {visibleRows.map((row, rowIdx) => {
                if (row.type === 'project') {
                  const isCollapsed = collapsedProjectIds.has(row.project.id);
                  const projectTaskCount = filteredTasks.filter(
                    (t) => t.projectId === row.project.id
                  ).length;
                  return (
                    <div
                      key={`proj-${row.project.id}`}
                      className="h-5 border-b border-t border-t-muted-foreground/60 px-3 flex items-center bg-muted-foreground/8 gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapsed(row.project.id)}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${row.project.name}`}
                        className="flex items-center justify-center rounded-sm hover:bg-muted-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3 w-3 text-foreground" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-foreground" />
                        )}
                      </button>
                      <div className="text-xs font-bold text-foreground truncate flex-1">
                        {row.project.name}
                      </div>
                      {isCollapsed && projectTaskCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0">
                          {projectTaskCount} {projectTaskCount === 1 ? 'task' : 'tasks'}
                        </span>
                      )}
                    </div>
                  );
                }
                const nextIsProject = visibleRows[rowIdx + 1]?.type === 'project';
                return (
                  <div
                    key={row.task.id}
                    className={cn(
                      'h-9 px-3',
                      !nextIsProject && 'border-b',
                      isGlobal && 'pl-4'
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 h-full">
                      {getPriorityDotColor(row.task.priority) && (
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full flex-shrink-0',
                            getPriorityDotColor(row.task.priority)
                          )}
                        />
                      )}
                      <div
                        className={cn(
                          'text-sm truncate flex-1 text-foreground',
                          row.task.status === 'done' && 'line-through text-muted-foreground'
                        )}
                        title={row.task.title}
                      >
                        {row.task.title}
                      </div>
                      {row.task.assignees && row.task.assignees.length > 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold flex items-center justify-center">
                            {row.task.assignees[0].user?.displayName?.charAt(0).toUpperCase() || '?'}
                          </div>
                          {row.task.assignees.length > 1 && (
                            <span className="text-[9px] text-muted-foreground font-medium">
                              +{row.task.assignees.length - 1}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-x-auto">
              <div style={{ width: totalWidth }} className="relative">
                {/* Time axis header */}
                <div className="h-16 border-b flex bg-card sticky top-0 z-10">
                  {timeColumns.map((col, idx) => (
                    <div
                      key={idx}
                      className="border-r border-muted p-2 text-xs font-medium text-muted-foreground"
                      style={{ width: columnWidth }}
                    >
                      {col.label}
                    </div>
                  ))}
                </div>

                {/* Today indicator */}
                {isTodayVisible && (
                  <div
                    className="absolute top-16 bottom-0 z-20 pointer-events-none"
                    style={{ left: todayPosition, width: '2px' }}
                  >
                    <div className="relative w-full h-full bg-interactive">
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-interactive whitespace-nowrap bg-card px-1 rounded">
                        Today
                      </div>
                    </div>
                  </div>
                )}

                {/* Sprint overlays */}
                {sprints.map((sprint, idx) => {
                  const startPos = getDatePosition(sprint.startDate);
                  const endPos = getDatePosition(sprint.endDate);
                  const width = endPos - startPos;
                  const color = SPRINT_COLORS[idx % SPRINT_COLORS.length];

                  return (
                    <div
                      key={sprint.id}
                      className={cn('absolute top-16 bottom-0 z-[1] pointer-events-none', color)}
                      style={{ left: startPos, width }}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70 p-1 truncate">
                        {sprint.name}
                      </div>
                    </div>
                  );
                })}

                {/* Milestone row */}
                {milestones.length > 0 && (
                  <div className="h-6 border-b relative bg-info/5">
                    {milestones.map((milestone) => {
                      const pos = getDatePosition(milestone.date);
                      return (
                        <Tooltip key={milestone.id}>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
                              style={{ left: pos }}
                              role="button"
                              tabIndex={0}
                              aria-label={milestone.name}
                            >
                              <div className="w-4 h-4 bg-info rotate-45 border-2 border-white shadow-md" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-1.5 py-0.5">
                              <div className="font-semibold text-sm">{milestone.name}</div>
                              <div className="text-background/70">
                                {new Date(milestone.date).toLocaleDateString()}
                              </div>
                              {milestone.projectId && (() => {
                                const projName = projects.find(p => p.id === milestone.projectId)?.name;
                                return projName ? (
                                  <div className="text-interactive/90 text-xs">{projName}</div>
                                ) : null;
                              })()}
                              <div className="flex items-center gap-1.5 pt-1.5 border-t border-background/20 mt-1">
                                <button
                                  onClick={() => handleOpenEditMilestone(milestone)}
                                  className="text-xs text-interactive hover:underline"
                                >
                                  Edit
                                </button>
                                <span className="text-background/40">|</span>
                                <button
                                  onClick={() => setDeleteMilestoneId(milestone.id)}
                                  className="text-xs text-destructive hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}

                {/* Task rows (grouped by project in global mode) */}
                {visibleRows.map((row, rowIdx) => {
                  if (row.type === 'project') {
                    const proj = row.project;
                    const hasDateRange = proj.startDate && proj.endDate;
                    const isCollapsed = collapsedProjectIds.has(proj.id);

                    // Compute earliest/latest task dates for collapsed summary bar.
                    let earliestDate: Date | null = null;
                    let latestDate: Date | null = null;
                    if (isCollapsed) {
                      const projectTasks = filteredTasks.filter(
                        (t) => t.projectId === proj.id
                      );
                      const taskDates: Date[] = [];
                      projectTasks.forEach((t) => {
                        if (t.startDate) taskDates.push(new Date(t.startDate));
                        if (t.dueDate) taskDates.push(new Date(t.dueDate));
                      });
                      if (taskDates.length > 0) {
                        earliestDate = new Date(
                          Math.min(...taskDates.map((d) => d.getTime()))
                        );
                        latestDate = new Date(
                          Math.max(...taskDates.map((d) => d.getTime()))
                        );
                      }
                    }

                    return (
                      <div
                        key={`proj-${proj.id}`}
                        className="h-5 border-b border-t border-t-muted-foreground/60 relative bg-muted-foreground/8"
                      >
                        {/* Grid lines */}
                        {timeColumns.map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-r border-muted"
                            style={{ left: idx * columnWidth }}
                          />
                        ))}
                        {/* Project bar — thin bracket */}
                        {hasDateRange && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-project-bar z-10"
                                style={{
                                  left: getDatePosition(proj.startDate!),
                                  width: Math.max(
                                    getDatePosition(proj.endDate!) - getDatePosition(proj.startDate!),
                                    4
                                  ),
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-semibold">{proj.name}</div>
                                <div className="text-muted-foreground">
                                  {new Date(proj.startDate!).toLocaleDateString()} - {new Date(proj.endDate!).toLocaleDateString()}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Collapsed summary bar — spans earliest task start to latest task end */}
                        {isCollapsed && earliestDate && latestDate && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-2 rounded-sm bg-foreground/20 z-[2]"
                            style={{
                              left: getDatePosition(earliestDate),
                              width: Math.max(
                                getDatePosition(latestDate) - getDatePosition(earliestDate),
                                4
                              ),
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  }

                  const task = row.task;
                  const nextIsProject = visibleRows[rowIdx + 1]?.type === 'project';
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'h-9 relative',
                        !nextIsProject && 'border-b',
                        rowIdx % 2 === 0 ? 'bg-card/70' : 'bg-muted/50'
                      )}
                    >
                      {/* Grid lines */}
                      {timeColumns.map((_, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 bottom-0 border-r border-muted"
                          style={{ left: idx * columnWidth }}
                        />
                      ))}

                      {/* Task bar or point */}
                      {task.startDate && task.dueDate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'absolute top-[6px] h-6 rounded-md cursor-pointer hover:shadow-md transition-shadow z-10',
                                getStatusColor(task.status),
                                isOverdue(task.dueDate, task.status) && 'ring-2 ring-destructive/50',
                                task.status === 'done' && 'opacity-60'
                              )}
                              style={{
                                left: getDatePosition(task.startDate),
                                width:
                                  getDatePosition(task.dueDate) -
                                  getDatePosition(task.startDate),
                                ...(isOverdue(task.dueDate, task.status) && {
                                  backgroundImage: 'var(--overdue-hatch)'
                                })
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={task.title}
                              onClick={() => setEditTask(task)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setEditTask(task);
                                }
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-semibold">{task.title}</div>
                              <div className="text-muted-foreground">
                                {new Date(task.startDate).toLocaleDateString()} -{' '}
                                {new Date(task.dueDate).toLocaleDateString()}
                              </div>
                              <div className="text-muted-foreground">
                                Status: {task.status} | Priority: {task.priority}
                              </div>
                              {task.assignees && task.assignees.length > 0 && (
                                <div className="text-muted-foreground">
                                  Assigned to:{' '}
                                  {task.assignees
                                    .map((a) => a.user?.displayName)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : task.dueDate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
                              style={{ left: getDatePosition(task.dueDate) }}
                              role="button"
                              tabIndex={0}
                              aria-label={task.title}
                              onClick={() => setEditTask(task)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setEditTask(task);
                                }
                              }}
                            >
                              <div
                                className={cn(
                                  'w-3 h-3 rounded-full border-2 border-white shadow-md',
                                  getStatusColor(task.status),
                                  isOverdue(task.dueDate, task.status) && 'ring-2 ring-destructive/50',
                                  task.status === 'done' && 'opacity-60'
                                )}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-semibold">{task.title}</div>
                              <div className="text-muted-foreground">
                                Due: {new Date(task.dueDate).toLocaleDateString()}
                              </div>
                              <div className="text-muted-foreground">
                                Status: {task.status} | Priority: {task.priority}
                              </div>
                              {task.assignees && task.assignees.length > 0 && (
                                <div className="text-muted-foreground">
                                  Assigned to:{' '}
                                  {task.assignees
                                    .map((a) => a.user?.displayName)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : task.startDate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
                              style={{ left: getDatePosition(task.startDate) }}
                              role="button"
                              tabIndex={0}
                              aria-label={task.title}
                              onClick={() => setEditTask(task)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setEditTask(task);
                                }
                              }}
                            >
                              <div
                                className={cn(
                                  'w-3 h-3 rounded-full border-2 border-white shadow-md',
                                  getStatusColor(task.status),
                                  task.status === 'done' && 'opacity-60'
                                )}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-semibold">{task.title}</div>
                              <div className="text-muted-foreground">
                                Start: {new Date(task.startDate).toLocaleDateString()}
                              </div>
                              <div className="text-muted-foreground">
                                Status: {task.status} | Priority: {task.priority}
                              </div>
                              {task.assignees && task.assignees.length > 0 && (
                                <div className="text-muted-foreground">
                                  Assigned to:{' '}
                                  {task.assignees
                                    .map((a) => a.user?.displayName)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Edit Drawer */}
      {editTask && (
        <TaskDrawer
          mode="edit"
          task={editTask}
          onSave={fetchData}
          onClose={() => {
            fetchData();
            setEditTask(null);
          }}
        />
      )}

      {/* Create/Edit Milestone Dialog */}
      <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMilestone ? 'Edit Milestone' : 'Create Milestone'}
            </DialogTitle>
            <DialogDescription>
              {editingMilestone
                ? 'Update the milestone details.'
                : 'Add a new milestone to mark an important date on the timeline.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <FormLabel htmlFor="milestone-name">
                Name <span className="text-destructive">*</span>
              </FormLabel>
              <Input
                id="milestone-name"
                value={milestoneForm.name}
                onChange={(e) =>
                  setMilestoneForm({ ...milestoneForm, name: e.target.value })
                }
                placeholder="Milestone name"
                maxLength={100}
                autoFocus
              />
            </div>

            <div>
              <FormLabel htmlFor="milestone-date">
                Date <span className="text-destructive">*</span>
              </FormLabel>
              <Input
                id="milestone-date"
                type="date"
                value={milestoneForm.date}
                onChange={(e) =>
                  setMilestoneForm({ ...milestoneForm, date: e.target.value })
                }
              />
            </div>

            {milestoneError && <p className="text-sm text-destructive">{milestoneError}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMilestoneDialog(false);
                setMilestoneError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveMilestone}>
              {editingMilestone ? 'Save Changes' : 'Create Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Milestone Confirmation */}
      <AlertDialog
        open={!!deleteMilestoneId}
        onOpenChange={() => setDeleteMilestoneId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this milestone. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMilestone}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

// Memoize TimelineView to prevent unnecessary re-renders with heavy CSS Grid calculations
export const TimelineView = memo(TimelineViewComponent);
