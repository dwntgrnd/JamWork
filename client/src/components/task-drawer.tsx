
import { useEffect, useRef, useState, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, getErrorMessage } from '@/lib/api';
import { invalidateProjects } from '@/hooks/use-projects';
import {
  Task,
  Project,
  Subtask,
  TaskLink,
  TaskStatus,
  TaskPriority,
  TaskEffort,
  RecurrenceType,
  STATUS_LABELS,
  PRIORITY_LABELS,
  UserSummary,
  Sprint,
} from '@/types';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { AlertCircle, Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useAutoSave } from '@/hooks/use-auto-save';
import { SaveStatusIndicator } from '@/components/save-status-indicator';
import { AssigneeSelector } from '@/components/assignee-selector';
import { SubtaskList } from '@/components/subtask-list';
import { TaskLinksSection } from '@/components/task-links-section';
import { ProjectSelector } from '@/components/project-selector';
import { DeleteConfirmDialog, UnsavedChangesDialog } from '@/components/task-drawer-dialogs';
import { DueDatePicker } from '@/components/due-date-picker';
import { getStatusChipClasses } from '@/lib/style-tokens';
import { cn } from '@/lib/utils';

/** Friendly labels for autosaved fields — used to name save feedback. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  effort: 'Effort',
  sprintId: 'Sprint',
  recurrence: 'Recurrence',
  startDate: 'Start date',
  dueDate: 'Due date',
  assigneeIds: 'Assignees',
  notifyEnabled: 'Notifications',
  showOnTimeline: 'Timeline visibility',
  includeInReport: 'Report inclusion',
};

/** Chrome-free trigger styling shared by the property-row select controls. */
const GHOST_TRIGGER =
  'w-fit border-0 bg-transparent px-2 text-sm font-medium shadow-none hover:bg-muted/50';

/**
 * One property row: a fixed-width muted label column and a value column.
 * `align="start"` top-anchors the label so it stays level with the first line
 * when a value wraps (assignees or the recurrence helper). `labelId` is the id
 * the value control points at via aria-labelledby.
 */
function PropertyRow({
  labelId,
  label,
  align = 'center',
  children,
}: {
  labelId: string;
  label: ReactNode;
  align?: 'center' | 'start';
  children: ReactNode;
}) {
  return (
    <div className={cn('grid grid-cols-[7rem_1fr] gap-x-3', align === 'start' ? 'items-start' : 'items-center')}>
      <span
        id={labelId}
        className={cn('text-xs font-medium text-muted-foreground', align === 'start' && 'pt-2')}
      >
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface TaskDrawerProps {
  mode: 'create' | 'edit';
  task?: Task;
  projectId?: string;
  defaultStatus?: TaskStatus;
  defaultSprintId?: string | null;
  onSave: () => void;
  onClose: () => void;
}

export function TaskDrawer({
  mode,
  task,
  projectId: initialProjectId,
  defaultStatus,
  defaultSprintId,
  onSave,
  onClose,
}: TaskDrawerProps) {
  // Form state
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  // Edit-mode description toggles between rendered markdown (read) and the
  // textarea (write); create mode is always write. (CC35)
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = useState<TaskStatus>(
    task?.status || defaultStatus || 'todo'
  );
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority || 'medium'
  );
  const [effort, setEffort] = useState<TaskEffort | null>(task?.effort ?? null);
  const [projectId, setProjectId] = useState(task?.projectId || initialProjectId || '');
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [startDate, setStartDate] = useState(
    task?.startDate ? new Date(task.startDate).toISOString().split('T')[0] : ''
  );
  const [recurrence, setRecurrence] = useState<RecurrenceType | null>(
    task?.recurrence || null
  );
  const [sprintId, setSprintId] = useState<string | null>(task?.sprintId || defaultSprintId || null);
  const [notifyEnabled, setNotifyEnabled] = useState(task?.notifyEnabled ?? true);
  const [showOnTimeline, setShowOnTimeline] = useState(task?.showOnTimeline ?? true);
  const [includeInReport, setIncludeInReport] = useState(task?.includeInReport ?? true);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    task?.assignees?.map((a) => a.userId) || []
  );
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [links, setLinks] = useState<TaskLink[]>(task?.links || []);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkError, setLinkError] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Data fetching state
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // Auto-save hook (edit mode only)
  const { saveField, status: saveStatus, error: saveError, field: saveFieldKey, clearError } = useAutoSave({
    taskId: task?.id || '',
    enabled: mode === 'edit' && !!task,
  });
  const saveFieldLabel = saveFieldKey ? FIELD_LABELS[saveFieldKey] ?? null : null;

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchSprints();
  }, []);

  // In create mode, seed the task-wide notification flag from the selected project's default.
  useEffect(() => {
    if (mode === 'create' && projectId) {
      const p = projects.find((proj) => proj.id === projectId);
      if (p) setNotifyEnabled(p.defaultNotifyEnabled !== false);
    }
  }, [mode, projectId, projects]);

  const handleNotifyEnabledChange = async (value: boolean) => {
    const prev = notifyEnabled;
    setNotifyEnabled(value);
    if (mode === 'edit') {
      try {
        await saveField('notifyEnabled', value);
      } catch {
        setNotifyEnabled(prev); // revert on failure
      }
    }
  };

  const handleShowOnTimelineChange = async (value: boolean) => {
    const prev = showOnTimeline;
    setShowOnTimeline(value);
    if (mode === 'edit') {
      try {
        await saveField('showOnTimeline', value);
      } catch {
        setShowOnTimeline(prev); // revert on failure
      }
    }
  };

  const handleIncludeInReportChange = async (value: boolean) => {
    const prev = includeInReport;
    setIncludeInReport(value);
    if (mode === 'edit') {
      try {
        await saveField('includeInReport', value);
      } catch {
        setIncludeInReport(prev); // revert on failure
      }
    }
  };

  // The report toggle is relevant only when the parent project is itself in
  // reports; otherwise it's hidden entirely (the DB value persists). The
  // project's flag comes from the already-loaded drawer projects list (CC34).
  const parentProjectInReport =
    projects.find((p) => p.id === projectId)?.includeInStatusReport === true;

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

  const fetchSprints = async () => {
    try {
      const data = await apiGet<{ sprints: Sprint[] }>('/sprints');
      setSprints(data.sprints);
    } catch (err) {
      console.error('Failed to fetch sprints:', err);
    }
  };

  // Filter and categorize sprints (exclude completed, sort by startDate)
  const filteredSprints = useMemo(() => {
    // Filter out completed sprints
    const activeSprints = sprints.filter((s) => s.status !== 'completed');
    // Already sorted by startDate from backend
    return activeSprints;
  }, [sprints]);

  // Unsaved changes detection (create mode only)
  const hasUnsavedChanges = useMemo(() => {
    if (mode === 'create') {
      // For create mode: dirty if any field has been filled in
      return !!(
        title.trim() ||
        description.trim() ||
        dueDate ||
        startDate ||
        recurrence ||
        selectedAssignees.length > 0
      );
    }
    // For edit mode: no unsaved changes check needed (auto-save)
    return false;
  }, [title, description, dueDate, startDate, recurrence, selectedAssignees, mode]);

  const handleClose = async () => {
    // The drawer can be dismissed (click-outside, Esc) without the focused field's
    // blur firing — which would silently drop a pending edit. Flush any in-progress
    // free-text edit and AWAIT it before closing, so the parent's on-close refetch
    // reads the saved value instead of racing the save. (Selects save on change.)
    if (mode === 'edit') {
      await handleTitleBlur();
      if (isEditingDescription) await handleDescriptionBlur();
    }
    if (mode === 'create' && hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  // Auto-save handlers for edit mode

  const handleStatusChange = async (newStatus: TaskStatus) => {
    const prev = status;
    setStatus(newStatus);
    if (mode === 'edit') {
      try {
        await saveField('status', newStatus);
        // Status changes alter a project's open-task count — refresh the sidebar badge.
        invalidateProjects();
      } catch {
        setStatus(prev); // revert on failure
      }
    }
  };

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    const prev = priority;
    setPriority(newPriority);
    if (mode === 'edit') {
      try {
        await saveField('priority', newPriority);
      } catch {
        setPriority(prev); // revert on failure
      }
    }
  };

  const handleEffortChange = async (newEffort: TaskEffort | null) => {
    const prev = effort;
    setEffort(newEffort);
    if (mode === 'edit') {
      try {
        await saveField('effort', newEffort);
      } catch {
        setEffort(prev); // revert on failure
      }
    }
  };

  const handleRecurrenceChange = async (newRecurrence: RecurrenceType | null) => {
    const prev = recurrence;
    setRecurrence(newRecurrence);
    if (mode === 'edit') {
      try {
        await saveField('recurrence', newRecurrence);
      } catch {
        setRecurrence(prev); // revert on failure
      }
    }
  };

  const handleTitleBlur = async () => {
    if (mode !== 'edit') return;

    if (!title.trim()) {
      // Empty title prevention: revert to original
      setTitle(task?.title || '');
      return;
    }
    if (title === (task?.title || '')) return; // no change, skip save

    try {
      await saveField('title', title.trim());
    } catch {
      setTitle(task?.title || ''); // revert on failure
    }
  };

  const handleDescriptionBlur = async () => {
    if (mode !== 'edit') return;

    if (description === (task?.description || '')) return; // no change, skip save

    try {
      await saveField('description', description.trim() || null);
    } catch {
      setDescription(task?.description || ''); // revert on failure
    }
  };

  // When entering write state, focus the textarea and place the cursor at the end.
  useEffect(() => {
    if (isEditingDescription && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [isEditingDescription]);

  const handleStartDateChange = async (newValue: string) => {
    const prev = startDate;
    setStartDate(newValue);
    if (mode === 'edit') {
      try {
        await saveField('startDate', newValue ? new Date(newValue).toISOString() : null);
      } catch {
        setStartDate(prev);
      }
    }
  };

  const handleDueDateChange = async (newValue: string) => {
    const prev = dueDate;
    setDueDate(newValue);
    if (mode === 'edit') {
      try {
        await saveField('dueDate', newValue ? new Date(newValue).toISOString() : null);
      } catch {
        setDueDate(prev);
      }
    }
  };

  const handleToggleAssignee = async (userId: string) => {
    const prev = [...selectedAssignees];
    const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId];
    setSelectedAssignees(next);
    if (mode === 'edit') {
      try {
        await saveField('assigneeIds', next);
      } catch {
        setSelectedAssignees(prev);
      }
    }
  };

  const handleProjectChange = async (newProjectId: string) => {
    if (mode === 'edit' && task) {
      const prev = projectId;
      setProjectId(newProjectId);
      try {
        await apiPut(`/tasks/${task.id}/move`, { projectId: newProjectId });
        // Task has moved projects, refresh parent view
        onSave();
      } catch (err: unknown) {
        setProjectId(prev); // revert on failure
        setError(getErrorMessage(err, 'Failed to move task'));
      }
    } else {
      // Create mode: just update state
      setProjectId(newProjectId);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;

    setCreatingProject(true);
    try {
      const data = await apiPost<{ project: Project }>('/projects', { name });
      setProjects((prev) => [...prev, data.project]);
      // Auto-select the newly created project
      if (mode === 'edit' && task) {
        await handleProjectChange(data.project.id);
      } else {
        setProjectId(data.project.id);
      }
      setNewProjectName('');
      setShowNewProjectForm(false);
      invalidateProjects();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create project'));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSprintChange = async (newValue: string) => {
    const prev = sprintId;
    // Convert 'none' and 'backlog' to null, otherwise use the sprint ID
    const newSprintId = (newValue === 'none' || newValue === 'backlog') ? null : newValue;
    setSprintId(newSprintId);
    if (mode === 'edit') {
      try {
        await saveField('sprintId', newSprintId);
      } catch {
        setSprintId(prev); // revert on failure
      }
    }
  };

  // Create mode batch save
  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please add a title');
      return;
    }

    if (title.length > 200) {
      setError('Title must be 200 characters or less');
      return;
    }

    if (!projectId) {
      setError('Please choose a project');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        projectId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        effort: effort ?? undefined,
        recurrence: recurrence || undefined,
        sprintId: sprintId || undefined,
        assigneeIds: selectedAssignees,
        notifyEnabled,
        ...(showOnTimeline === false ? { showOnTimeline: false } : {}),
        ...(includeInReport === false ? { includeInReport: false } : {}),
      };

      if (mode === 'create') {
        await apiPost('/tasks', payload);
      } else if (task) {
        await apiPut(`/tasks/${task.id}`, payload);
      }

      setSaved(true);
      invalidateProjects();
      setTimeout(() => {
        onSave();
      }, 1000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save task'));
      setSaving(false);
    }
  };

  // Create mode: ⌘/Ctrl+Enter submits from any field (power-user accelerator).
  const handleCreateKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    try {
      await apiDelete(`/tasks/${task.id}`);
      invalidateProjects();
      onSave();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete task'));
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return;

    try {
      const data = await apiPost<{ subtask: Subtask }>(`/tasks/${task.id}/subtasks`, {
        title: newSubtaskTitle.trim(),
      });

      setSubtasks([...subtasks, data.subtask]);
      setNewSubtaskTitle('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to add subtask'));
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    if (!task) return;

    try {
      const data = await apiPut<{ subtask: Subtask }>(
        `/tasks/${task.id}/subtasks/${subtask.id}`,
        { completed: !subtask.completed }
      );

      setSubtasks(
        subtasks.map((s) => (s.id === subtask.id ? data.subtask : s))
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update subtask'));
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task) return;

    try {
      await apiDelete(`/tasks/${task.id}/subtasks/${subtaskId}`);
      setSubtasks(subtasks.filter((s) => s.id !== subtaskId));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete subtask'));
    }
  };

  const handleAddLink = async () => {
    if (!task || !newLinkUrl.trim()) return;
    // Client-side validation
    const url = newLinkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setLinkError('URL must start with http:// or https://');
      return;
    }
    setLinkError('');
    try {
      const data = await apiPost<{ link: TaskLink }>(`/tasks/${task.id}/links`, {
        url,
        title: newLinkTitle.trim() || undefined,
      });
      setLinks([data.link, ...links]);
      setNewLinkUrl('');
      setNewLinkTitle('');
      setShowAddLink(false);
    } catch (err: unknown) {
      setLinkError(getErrorMessage(err, 'Failed to add link'));
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!task) return;
    try {
      await apiDelete(`/tasks/${task.id}/links/${linkId}`);
      setLinks(links.filter((l) => l.id !== linkId));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete link'));
    }
  };

  return (
    <>
      <Sheet open={true} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="w-full sm:w-[620px] sm:max-w-[620px] max-sm:!w-full max-sm:!max-w-full p-0 flex flex-col h-full"
        >
          <SheetTitle className="sr-only">
            {mode === 'create' ? 'New task' : 'Edit task'}
          </SheetTitle>

          {/* Autosave failure — loud, named, and states the revert plainly. pr-12 keeps it clear of the Sheet's floating close button. */}
          {mode === 'edit' && saveStatus === 'error' && (
            <div
              role="alert"
              className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/10 py-2.5 pl-6 pr-12 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1">
                Couldn&apos;t save {saveFieldLabel ?? 'your change'}
                {saveError ? `: ${saveError}` : ''}. The previous value was restored.
              </p>
              <button
                type="button"
                onClick={clearError}
                aria-label="Dismiss"
                className="-mr-1 shrink-0 rounded p-0.5 outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div
            className={cn(
              'flex-1 overflow-y-auto px-6 pb-5',
              // Clear the Sheet's floating close button when no banner sits above the content.
              mode === 'edit' && saveStatus === 'error' ? 'pt-4' : 'pt-10',
            )}
            onKeyDown={mode === 'create' ? handleCreateKeyDown : undefined}
          >
            <div className="space-y-5">
              {/* === TITLE — unboxed; hover-tint, teal ring, and a pencil signal editability === */}
              <div>
                <div className="group -mx-2 flex items-center gap-1.5 rounded-md px-2 transition-colors cursor-text hover:bg-muted/40 focus-within:bg-transparent focus-within:ring-[3px] focus-within:ring-ring/50">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={mode === 'edit' ? handleTitleBlur : undefined}
                    placeholder={mode === 'create' ? 'Task title' : 'Untitled task'}
                    maxLength={200}
                    autoFocus
                    aria-label="Task title"
                    className="min-w-0 flex-1 border-0 bg-transparent py-1 text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <Pencil aria-hidden="true" className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                </div>
                {title.length > 160 && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">{title.length}/200</p>
                )}
              </div>

              {/* Hairline under the title, separating it from the properties. */}
              <div className="h-px bg-border" aria-hidden="true" />

              {/* === PROPERTIES — one grammar: muted label column + value column === */}
              <div className="space-y-1">
                {/* Status */}
                <PropertyRow labelId="task-status-label" label="Status">
                  <Select
                    value={status}
                    onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                  >
                    <SelectTrigger
                      aria-labelledby="task-status-label"
                      className={cn('w-fit border-0 shadow-none', getStatusChipClasses(status))}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                      <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
                      <SelectItem value="blocked">{STATUS_LABELS.blocked}</SelectItem>
                      <SelectItem value="review">{STATUS_LABELS.review}</SelectItem>
                      <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
                    </SelectContent>
                  </Select>
                </PropertyRow>

                {/* Dates — Start → Due read as one range. Inline on the wide
                    drawer; stacks on the narrow (mobile) drawer at the same
                    sm breakpoint the Sheet uses to switch width. */}
                <PropertyRow labelId="task-dates-label" label="Dates" align="start">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span id="task-start-label" className="sr-only">Start date</span>
                    <DueDatePicker
                      value={startDate}
                      plain
                      labelledById="task-start-label"
                      onChange={handleStartDateChange}
                      emptyLabel="No start date"
                      showInlineClear
                      withIcon
                      triggerClassName="inline-flex h-9 items-center gap-1.5 px-2"
                      labelClassName="text-sm font-medium"
                    />
                    <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">→</span>
                    <DueDatePicker
                      value={dueDate}
                      status={status}
                      labelledById="task-due-label"
                      onChange={handleDueDateChange}
                      emptyLabel="No due date"
                      showInlineClear
                      withIcon
                      triggerClassName="inline-flex h-9 items-center gap-1.5 px-2"
                      labelClassName="text-sm font-medium"
                    />
                    <span id="task-due-label" className="sr-only">Due date</span>
                  </div>
                </PropertyRow>

                {/* Priority */}
                <PropertyRow labelId="task-priority-label" label="Priority">
                  <Select
                    value={priority}
                    onValueChange={(v) => handlePriorityChange(v as TaskPriority)}
                  >
                    <SelectTrigger aria-labelledby="task-priority-label" className={GHOST_TRIGGER}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                      <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                      <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                      <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                    </SelectContent>
                  </Select>
                </PropertyRow>

                {/* Effort */}
                <PropertyRow labelId="task-effort-label" label="Effort">
                  <Select
                    value={effort?.toString() || 'none'}
                    onValueChange={(v) => handleEffortChange(v === 'none' ? null : parseInt(v) as TaskEffort)}
                  >
                    <SelectTrigger aria-labelledby="task-effort-label" className={GHOST_TRIGGER}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="1">S - Small</SelectItem>
                      <SelectItem value="2">M - Medium</SelectItem>
                      <SelectItem value="4">L - Large</SelectItem>
                      <SelectItem value="8">XL - Extra Large</SelectItem>
                    </SelectContent>
                  </Select>
                </PropertyRow>

                <div className="my-2 h-px bg-border" aria-hidden="true" />

                {/* Sprint */}
                <PropertyRow labelId="task-sprint-label" label="Sprint">
                  <Select
                    value={sprintId || 'none'}
                    onValueChange={handleSprintChange}
                  >
                    <SelectTrigger aria-labelledby="task-sprint-label" className={GHOST_TRIGGER}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      {filteredSprints.map((sprint) => (
                        <SelectItem key={sprint.id} value={sprint.id}>
                          <span className={sprint.status === 'active' ? 'font-semibold text-primary' : ''}>
                            {sprint.name}
                            {sprint.status === 'active' && ' (Active)'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertyRow>

                {/* Recurrence */}
                <PropertyRow labelId="task-recurrence-label" label="Recurrence" align="start">
                  <div>
                    <Select
                      value={recurrence || 'none'}
                      onValueChange={(v) => handleRecurrenceChange(v === 'none' ? null : v as RecurrenceType)}
                    >
                      <SelectTrigger aria-labelledby="task-recurrence-label" className={GHOST_TRIGGER}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Biweekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    {recurrence && (
                      <p className="px-2 text-xs text-muted-foreground">
                        Repeats {recurrence} after completion
                      </p>
                    )}
                  </div>
                </PropertyRow>

                {/* Project */}
                {(mode === 'edit' || (mode === 'create' && !initialProjectId)) && (
                  <PropertyRow
                    labelId="task-project-label"
                    align="start"
                    label={
                      <>
                        Project
                        {mode === 'create' && !initialProjectId && <span className="text-destructive"> *</span>}
                      </>
                    }
                  >
                    <ProjectSelector
                      projectId={projectId}
                      projects={projects}
                      onValueChange={(v) => {
                        if (v === '__new__') {
                          setShowNewProjectForm(true);
                        } else {
                          handleProjectChange(v);
                        }
                      }}
                      showNewProjectForm={showNewProjectForm}
                      newProjectName={newProjectName}
                      onNewProjectNameChange={setNewProjectName}
                      creatingProject={creatingProject}
                      onCreateProject={handleCreateProject}
                      onCancelNewProject={() => {
                        setShowNewProjectForm(false);
                        setNewProjectName('');
                      }}
                    />
                  </PropertyRow>
                )}

                <div className="my-2 h-px bg-border" aria-hidden="true" />

                {/* Assignees */}
                <PropertyRow labelId="task-assignees-label" label="Assignees" align="start">
                  <div className="py-1.5">
                    <AssigneeSelector
                      users={users}
                      selectedAssignees={selectedAssignees}
                      onToggle={handleToggleAssignee}
                      labelledById="task-assignees-label"
                    />
                  </div>
                </PropertyRow>
              </div>

              {/* === DESCRIPTION — below the properties, unboxed === */}
              <div>
                <label htmlFor="task-description" className="text-xs font-medium text-muted-foreground">
                  Description
                </label>

                {mode === 'edit' && !isEditingDescription ? (
                  // Read state: rendered markdown (or placeholder) — click/Enter to edit.
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsEditingDescription(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsEditingDescription(true);
                      }
                    }}
                    className="group mt-1 -mx-2 flex items-start gap-1.5 rounded-md px-2 transition-colors cursor-pointer outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {description.trim() ? (
                      <MarkdownRenderer content={description} className="min-w-0 flex-1 min-h-[72px] py-1.5" />
                    ) : (
                      <span className="min-w-0 flex-1 min-h-[72px] py-1.5 text-sm text-muted-foreground">
                        What needs to be done?
                      </span>
                    )}
                    <Pencil aria-hidden="true" className="pointer-events-none mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                  </div>
                ) : (
                  // Write state: the textarea (always in create mode) + a markdown hint.
                  <>
                    <div className="group mt-1 -mx-2 flex items-start gap-1.5 rounded-md px-2 transition-colors cursor-text hover:bg-muted/40 focus-within:bg-transparent focus-within:ring-[3px] focus-within:ring-ring/50">
                      <textarea
                        id="task-description"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          // Auto-grow: reset height then set to scrollHeight
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onBlur={
                          mode === 'edit'
                            ? () => {
                                handleDescriptionBlur();
                                setIsEditingDescription(false);
                              }
                            : undefined
                        }
                        placeholder="What needs to be done?"
                        maxLength={5000}
                        className="min-w-0 flex-1 min-h-[72px] resize-none border-0 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        ref={(el) => {
                          textareaRef.current = el;
                          // Set initial height on mount based on content
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                          }
                        }}
                      />
                      <Pencil aria-hidden="true" className="pointer-events-none mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Supports **bold**, *italic*, lists, and [links](url)
                    </p>
                  </>
                )}
              </div>

              {/* === SUBTASKS (edit mode only) === */}
              {mode === 'edit' && task && (
                <SubtaskList
                  subtasks={subtasks}
                  newSubtaskTitle={newSubtaskTitle}
                  onNewSubtaskTitleChange={setNewSubtaskTitle}
                  onAdd={handleAddSubtask}
                  onToggle={handleToggleSubtask}
                  onDelete={handleDeleteSubtask}
                />
              )}

              {/* === LINKS (edit mode only) === */}
              {mode === 'edit' && task && (
                <TaskLinksSection
                  links={links}
                  showAddLink={showAddLink}
                  onShowAddLinkChange={setShowAddLink}
                  newLinkUrl={newLinkUrl}
                  onNewLinkUrlChange={(v) => {
                    setNewLinkUrl(v);
                    setLinkError('');
                  }}
                  newLinkTitle={newLinkTitle}
                  onNewLinkTitleChange={setNewLinkTitle}
                  linkError={linkError}
                  onAdd={handleAddLink}
                  onCancelAdd={() => {
                    setShowAddLink(false);
                    setNewLinkUrl('');
                    setNewLinkTitle('');
                    setLinkError('');
                  }}
                  onDelete={handleDeleteLink}
                />
              )}

              {/* Visibility + Notifications — settings-style toggle rows, anchored
                  to the bottom of the drawer, below links (CC34, repositioned). */}
              <div className="h-px bg-border" aria-hidden="true" />
              <div className="space-y-4 py-1">
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Visibility</p>

                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <span id="task-show-timeline-label" className="block text-sm font-medium text-foreground">
                        Show on timeline
                      </span>
                      <p className="text-xs text-muted-foreground">
                        When off, this task won&apos;t appear on the timeline even if dates are set.
                      </p>
                    </div>
                    <Switch
                      aria-labelledby="task-show-timeline-label"
                      checked={showOnTimeline}
                      onCheckedChange={handleShowOnTimelineChange}
                    />
                  </div>

                  {parentProjectInReport && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <span id="task-include-report-label" className="block text-sm font-medium text-foreground">
                          Include in status reports
                        </span>
                        <p className="text-xs text-muted-foreground">
                          When off, this task won&apos;t appear in generated reports for this project.
                        </p>
                      </div>
                      <Switch
                        aria-labelledby="task-include-report-label"
                        checked={includeInReport}
                        onCheckedChange={handleIncludeInReportChange}
                      />
                    </div>
                  )}
                </div>

                {/* Notifications — same orientation as the visibility rows */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span id="task-notify-label" className="block text-sm font-medium text-foreground">
                      Notifications
                    </span>
                    <p className="text-xs text-muted-foreground">
                      When off, no assignment, removal, or update emails are sent for this task.
                    </p>
                  </div>
                  <Switch
                    aria-labelledby="task-notify-label"
                    checked={notifyEnabled}
                    onCheckedChange={handleNotifyEnabledChange}
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>
              )}

              {/* Saved indicator (create mode only) */}
              {mode === 'create' && saved && (
                <p className="text-sm text-success bg-success/10 p-2 rounded flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Task created.
                </p>
              )}
            </div>
          </div>

          {/* Footer - create mode */}
          {mode === 'create' && (
            <div className="sticky bottom-0 bg-background border-t px-6 py-3">
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || saved}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating…
                    </>
                  ) : saved ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Created
                    </>
                  ) : (
                    'Create task'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Footer - edit mode */}
          {mode === 'edit' && task && (
            <div className="sticky bottom-0 bg-background border-t px-6 py-3">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete task
                </Button>
                <SaveStatusIndicator status={saveStatus} label={saveFieldLabel} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
      />

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onDiscard={onClose}
      />
    </>
  );
}
