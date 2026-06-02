
import { useState, useEffect } from 'react';
import { Task, Sprint } from '@/types';
import { apiGet, apiPut, apiPost, getErrorMessage } from '@/lib/api';
import { invalidateProjects } from '@/hooks/use-projects';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CheckCircle2, Trash2, ArrowRightCircle, Inbox } from 'lucide-react';

interface BulkActionBarProps {
  selectedTaskIds: Set<string>;
  tasks: Task[];
  onActionComplete: () => void;
  onClearSelection: () => void;
  projectId?: string;
}

export function BulkActionBar({
  selectedTaskIds,
  tasks,
  onActionComplete,
  onClearSelection,
  projectId,
}: BulkActionBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSprintPicker, setShowSprintPicker] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    fetchSprints();
  }, [projectId]);

  const fetchSprints = async () => {
    try {
      const params = new URLSearchParams();
      if (projectId) {
        params.append('projectId', projectId);
      }
      const data = await apiGet<{ sprints: Sprint[] }>(`/sprints?${params.toString()}`);
      setSprints(data.sprints.filter(s => s.status === 'active'));
    } catch (err) {
      console.error('Failed to fetch sprints:', err);
    }
  };

  const handleMarkAsDone = async () => {
    setIsExecuting(true);
    const taskIds = Array.from(selectedTaskIds);

    // Capture previous statuses for undo
    const previousStatuses = new Map<string, string>();
    taskIds.forEach(id => {
      const task = tasks.find(t => t.id === id);
      if (task) {
        previousStatuses.set(id, task.status);
      }
    });

    try {
      await apiPut('/tasks/bulk-update', {
        taskIds,
        fields: { status: 'done' },
      });
      // Status changes alter projects' open-task counts — refresh the sidebar badges.
      invalidateProjects();

      toast.success(`Marked ${taskIds.length} task(s) as done`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              // Restore each task's original status
              for (const [id, status] of previousStatuses.entries()) {
                await apiPut(`/tasks/${id}`, { status });
              }
              invalidateProjects();
              onActionComplete();
              toast.success('Undo complete');
            } catch (err) {
              console.error('Failed to undo:', err);
              toast.error('Failed to undo');
            }
          },
        },
      });

      onActionComplete();
    } catch (err: unknown) {
      console.error('Failed to mark tasks as done:', err);
      toast.error(getErrorMessage(err, 'Failed to update tasks'));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDelete = async () => {
    setIsExecuting(true);
    const taskIds = Array.from(selectedTaskIds);

    try {
      await apiPost('/tasks/bulk-delete', { taskIds });
      toast.success(`Deleted ${taskIds.length} task(s)`);
      invalidateProjects();
      onActionComplete();
    } catch (err: unknown) {
      console.error('Failed to delete tasks:', err);
      toast.error(getErrorMessage(err, 'Failed to delete tasks'));
    } finally {
      setIsExecuting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleMoveToSprint = async (sprintId: string) => {
    setIsExecuting(true);
    const taskIds = Array.from(selectedTaskIds);
    const sprint = sprints.find(s => s.id === sprintId);

    try {
      await apiPut('/tasks/bulk-update', {
        taskIds,
        fields: { sprintId },
      });

      toast.success(`Moved ${taskIds.length} task(s) to ${sprint?.name || 'sprint'}`);
      onActionComplete();
    } catch (err: unknown) {
      console.error('Failed to move tasks to sprint:', err);
      toast.error(getErrorMessage(err, 'Failed to move tasks'));
    } finally {
      setIsExecuting(false);
      setShowSprintPicker(false);
    }
  };

  const handleMoveToBacklog = async () => {
    setIsExecuting(true);
    const taskIds = Array.from(selectedTaskIds);

    // Capture previous sprint IDs for undo
    const previousSprintIds = new Map<string, string | null>();
    taskIds.forEach(id => {
      const task = tasks.find(t => t.id === id);
      if (task) {
        previousSprintIds.set(id, task.sprintId || null);
      }
    });

    try {
      await apiPut('/tasks/bulk-update', {
        taskIds,
        fields: { sprintId: null },
      });

      toast.success(`Moved ${taskIds.length} task(s) to backlog`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              // Restore each task's original sprint
              for (const [id, sprintId] of previousSprintIds.entries()) {
                if (sprintId) {
                  await apiPut(`/tasks/${id}`, { sprintId });
                }
              }
              onActionComplete();
              toast.success('Undo complete');
            } catch (err) {
              console.error('Failed to undo:', err);
              toast.error('Failed to undo');
            }
          },
        },
      });

      onActionComplete();
    } catch (err: unknown) {
      console.error('Failed to move tasks to backlog:', err);
      toast.error(getErrorMessage(err, 'Failed to move tasks'));
    } finally {
      setIsExecuting(false);
    }
  };

  const selectedCount = selectedTaskIds.size;
  const sprintsByProject = sprints.reduce((acc, sprint) => {
    const projectName = sprint.project?.name || 'Unknown Project';
    if (!acc[projectName]) {
      acc[projectName] = [];
    }
    acc[projectName].push(sprint);
    return acc;
  }, {} as Record<string, Sprint[]>);

  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Left side: selection count and clear button */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onClearSelection}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            disabled={isExecuting}
          >
            Clear
          </button>
        </div>

        {/* Right side: action buttons */}
        <div className="flex items-center gap-2">
          {/* Mark as Done */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAsDone}
            disabled={isExecuting}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as Done
          </Button>

          {/* Move to Sprint */}
          <Popover open={showSprintPicker} onOpenChange={setShowSprintPicker}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isExecuting}
                className="gap-2"
              >
                <ArrowRightCircle className="h-4 w-4" />
                Move to Sprint
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="space-y-1">
                {sprints.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No active sprints</p>
                ) : !projectId && Object.keys(sprintsByProject).length > 1 ? (
                  // Multiple projects - group by project
                  Object.entries(sprintsByProject).map(([projectName, projectSprints]) => (
                    <div key={projectName}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                        {projectName}
                      </div>
                      {projectSprints.map(sprint => (
                        <button
                          key={sprint.id}
                          onClick={() => handleMoveToSprint(sprint.id)}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded-sm transition-colors"
                        >
                          {sprint.name}
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  // Single project or project-specific view - flat list
                  sprints.map(sprint => (
                    <button
                      key={sprint.id}
                      onClick={() => handleMoveToSprint(sprint.id)}
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded-sm transition-colors"
                    >
                      {sprint.name}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Move to Backlog */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleMoveToBacklog}
            disabled={isExecuting}
            className="gap-2"
          >
            <Inbox className="h-4 w-4" />
            Backlog
          </Button>

          {/* Delete */}
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isExecuting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedCount} task{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. {selectedCount} task{selectedCount !== 1 ? 's' : ''} will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
