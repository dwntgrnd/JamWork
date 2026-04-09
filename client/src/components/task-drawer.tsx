
import { useEffect, useState, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Check,
  X,
  Plus,
  Loader2,
  ExternalLink,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoSave } from '@/hooks/use-auto-save';
import { SaveStatusIndicator } from '@/components/save-status-indicator';

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
  const { saveField, status: saveStatus, error: saveError, clearError } = useAutoSave({
    taskId: task?.id || '',
    enabled: mode === 'edit' && !!task,
  });

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchSprints();
  }, []);

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

  const handleClose = () => {
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
      } catch (err: any) {
        setProjectId(prev); // revert on failure
        setError(err.message || 'Failed to move task');
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
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
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
      setError('Title is required');
      return;
    }

    if (title.length > 200) {
      setError('Title must be 200 characters or less');
      return;
    }

    if (!projectId) {
      setError('Project is required');
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
      };

      if (mode === 'create') {
        await apiPost('/tasks', payload);
      } else if (task) {
        await apiPut(`/tasks/${task.id}`, payload);
      }

      setSaved(true);
      setTimeout(() => {
        onSave();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    try {
      await apiDelete(`/tasks/${task.id}`);
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to delete task');
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
    } catch (err: any) {
      setError(err.message || 'Failed to add subtask');
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
    } catch (err: any) {
      setError(err.message || 'Failed to update subtask');
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task) return;

    try {
      await apiDelete(`/tasks/${task.id}/subtasks/${subtaskId}`);
      setSubtasks(subtasks.filter((s) => s.id !== subtaskId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete subtask');
    }
  };

  // Link handlers
  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
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
    } catch (err: any) {
      setLinkError(err.message || 'Failed to add link');
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!task) return;
    try {
      await apiDelete(`/tasks/${task.id}/links/${linkId}`);
      setLinks(links.filter((l) => l.id !== linkId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete link');
    }
  };

  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;

  return (
    <>
      <Sheet open={true} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="w-full sm:w-[620px] sm:max-w-[620px] max-sm:!w-full max-sm:!max-w-full p-0 flex flex-col h-full"
        >
          <SheetHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4">
            <SheetTitle>
              {mode === 'create' ? 'Create New Task' : 'Edit Task'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {/* === IDENTITY GROUP === */}
              <div className="space-y-2">
                {/* Editable title heading */}
                <div className="bg-field-bg rounded-lg border border-field-border hover:bg-field-bg/80 transition-colors">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={mode === 'edit' ? handleTitleBlur : undefined}
                    placeholder={mode === 'create' ? 'Task title' : 'Untitled task'}
                    maxLength={200}
                    autoFocus
                    aria-label="Task title"
                    className="w-full text-xl font-semibold text-foreground bg-transparent border-0 outline-none ring-0 px-3 py-2.5 placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-ring/20 focus:rounded-lg transition-all"
                  />
                </div>

                {/* Always-visible auto-growing description */}
                <div className="bg-field-bg rounded-lg border border-field-border hover:bg-field-bg/80 transition-colors">
                  <textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      // Auto-grow: reset height then set to scrollHeight
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={mode === 'edit' ? handleDescriptionBlur : undefined}
                    placeholder="What needs to be done?"
                    maxLength={5000}
                    aria-label="Task description"
                    className="w-full min-h-[80px] text-sm text-foreground bg-transparent border-0 outline-none ring-0 px-3 py-2.5 resize-none placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-ring/20 focus:rounded-lg transition-all"
                    ref={(el) => {
                      // Set initial height on mount based on content
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }
                    }}
                  />
                </div>
              </div>

              {/* === WORKFLOW GROUP — 2-column grid === */}
              <div>
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Workflow</h3>
                <div className="grid grid-cols-2 gap-2.5">
                    {/* Status */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Status</span>
                      <Select
                        value={status}
                        onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                          <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
                          <SelectItem value="review">{STATUS_LABELS.review}</SelectItem>
                          <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Priority */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Priority</span>
                      <Select
                        value={priority}
                        onValueChange={(v) => handlePriorityChange(v as TaskPriority)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                          <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                          <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                          <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Effort */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Effort</span>
                      <Select
                        value={effort?.toString() || 'none'}
                        onValueChange={(v) => handleEffortChange(v === 'none' ? null : parseInt(v) as TaskEffort)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
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
                    </div>

                    {/* Sprint */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Sprint</span>
                      <Select
                        value={sprintId || 'none'}
                        onValueChange={handleSprintChange}
                      >
                        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
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
                    </div>

                    {/* Start Date */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <label htmlFor="start-date" className="text-[11px] text-muted-foreground uppercase tracking-wider">Start</label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5"
                      />
                    </div>

                    {/* Due Date */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <label htmlFor="due-date" className="text-[11px] text-muted-foreground uppercase tracking-wider">Due</label>
                      <Input
                        id="due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => handleDueDateChange(e.target.value)}
                        className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5"
                      />
                    </div>

                    {/* Recurrence */}
                    <div className="bg-field-bg rounded-md border border-field-border p-2">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Recurrence</span>
                      <Select
                        value={recurrence || 'none'}
                        onValueChange={(v) => handleRecurrenceChange(v === 'none' ? null : v as RecurrenceType)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
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
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          Repeats {recurrence} after completion
                        </p>
                      )}
                    </div>

                    {/* Project */}
                    {(mode === 'edit' || (mode === 'create' && !initialProjectId)) && (
                      <div className="bg-field-bg rounded-md border border-field-border p-2">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                          Project {mode === 'create' && !initialProjectId && <span className="text-destructive">*</span>}
                        </span>
                        <Select
                          value={projectId}
                          onValueChange={(v) => {
                            if (v === '__new__') {
                              setShowNewProjectForm(true);
                            } else {
                              handleProjectChange(v);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__" className="text-interactive font-medium">
                              <Plus className="h-3 w-3 inline mr-1" />
                              New Project
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {showNewProjectForm && (
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              placeholder="Project name"
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCreateProject();
                                }
                                if (e.key === 'Escape') {
                                  setShowNewProjectForm(false);
                                  setNewProjectName('');
                                }
                              }}
                              className="flex-1 h-8 text-sm"
                              autoFocus
                              disabled={creatingProject}
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={handleCreateProject}
                              disabled={!newProjectName.trim() || creatingProject}
                            >
                              {creatingProject ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Save'
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                setShowNewProjectForm(false);
                                setNewProjectName('');
                              }}
                              disabled={creatingProject}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>

              {/* === ASSIGNEES — own section === */}
              <div>
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Assignees</h3>
                <div className="flex flex-wrap gap-2">
                  {users.map((user) => (
                    <Badge
                      key={user.id}
                      variant={
                        selectedAssignees.includes(user.id) ? 'default' : 'outline'
                      }
                      className="cursor-pointer text-sm font-medium"
                      onClick={() => handleToggleAssignee(user.id)}
                    >
                      {selectedAssignees.includes(user.id) && (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      {user.displayName}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* === SUBTASKS & LINKS === */}
              <div className="space-y-3">
                {/* Subtasks (edit mode only) */}
                {mode === 'edit' && task && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] text-muted-foreground">Subtasks</span>
                        {subtasks.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {completedSubtasksCount}/{subtasks.length} complete
                          </Badge>
                        )}
                      </div>

                      {/* Subtask list */}
                      <div className="space-y-2">
                        {subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="flex items-center gap-2 group"
                          >
                            <Checkbox
                              checked={subtask.completed}
                              onCheckedChange={() => handleToggleSubtask(subtask)}
                            />
                            <span
                              className={cn(
                                'flex-1 text-sm',
                                subtask.completed && 'line-through text-muted-foreground'
                              )}
                            >
                              {subtask.title}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSubtask(subtask.id)}
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Add subtask */}
                      <div className="flex items-center gap-2 mt-2 border-b border-dashed border-field-border pb-1">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <Input
                          placeholder="Add a subtask..."
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddSubtask();
                            }
                          }}
                          className="flex-1 h-8 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* === RELATED ITEMS GROUP === */}
              {mode === 'edit' && task && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Links</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowAddLink(!showAddLink)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>

                  {/* Add link form */}
                  {showAddLink && (
                    <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                      <Input
                        placeholder="https://example.com"
                        value={newLinkUrl}
                        onChange={(e) => { setNewLinkUrl(e.target.value); setLinkError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Link title (optional)"
                        value={newLinkTitle}
                        onChange={(e) => setNewLinkTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                        className="h-8 text-sm"
                      />
                      {linkError && (
                        <p className="text-xs text-destructive">{linkError}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowAddLink(false); setNewLinkUrl(''); setNewLinkTitle(''); setLinkError(''); }}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={handleAddLink}>
                          Add Link
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Link rows */}
                  {links.length > 0 && (
                    <div className="space-y-1">
                      {links.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center gap-2 group py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate flex-1"
                            title={link.url}
                          >
                            {link.title || getDomain(link.url)}
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => handleDeleteLink(link.id)}
                          >
                            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state when no links and form not showing */}
                  {links.length === 0 && !showAddLink && (
                    <div
                      className="flex items-center gap-2 border-b border-dashed border-field-border pb-1 cursor-pointer"
                      onClick={() => setShowAddLink(true)}
                    >
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <span className="text-sm text-muted-foreground/50">Add a link...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>
              )}

              {/* Saved indicator (create mode only) */}
              {mode === 'create' && saved && (
                <p className="text-sm text-success bg-success/10 p-2 rounded flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Saved successfully!
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
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Footer - edit mode */}
          {mode === 'edit' && task && (
            <div className="sticky bottom-0 bg-background border-t px-6 py-3">
              <div className="flex justify-between items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Task
                </Button>
                <SaveStatusIndicator status={saveStatus} error={saveError} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This task will be deleted and removed from all views. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes confirmation (create mode only) */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
