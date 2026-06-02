import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isOverdue } from '@/lib/date-utils';
import { Task, TaskStatus } from '@/types';

// Status colors for timeline bars (uses CSS variable tokens)
const getStatusColor = (status: TaskStatus) => {
  switch (status) {
    case 'todo':
      return 'bg-status-todo-bg';
    case 'in_progress':
      return 'bg-status-in_progress-bg';
    case 'blocked':
      return 'bg-status-blocked-bg';
    case 'review':
      return 'bg-status-review-bg';
    case 'done':
      return 'bg-status-done-bg';
    default:
      return 'bg-status-todo-bg';
  }
};

interface TimelineTaskBarProps {
  task: Task;
  getDatePosition: (date: Date | string) => number;
  onEdit: (task: Task) => void;
}

/** A task's bar (start+due) or point (single date) within a timeline row, with tooltip. */
export function TimelineTaskBar({ task, getDatePosition, onEdit }: TimelineTaskBarProps) {
  if (task.startDate && task.dueDate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'absolute top-[6px] h-6 rounded-md cursor-pointer hover:shadow-md transition-shadow z-10',
              getStatusColor(task.status),
              isOverdue(task.dueDate, task.status) && 'ring-2 ring-destructive/50',
              task.status === 'blocked' && !isOverdue(task.dueDate, task.status) && 'ring-2 ring-status-blocked-fg/60',
              task.status === 'done' && 'opacity-60'
            )}
            style={{
              left: getDatePosition(task.startDate),
              width: getDatePosition(task.dueDate) - getDatePosition(task.startDate),
              ...(isOverdue(task.dueDate, task.status) && {
                backgroundImage: 'var(--overdue-hatch)',
              }),
            }}
            role="button"
            tabIndex={0}
            aria-label={task.title}
            onClick={() => onEdit(task)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit(task);
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
                {task.assignees.map((a) => a.user?.displayName).join(', ')}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (task.dueDate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
            style={{ left: getDatePosition(task.dueDate) }}
            role="button"
            tabIndex={0}
            aria-label={task.title}
            onClick={() => onEdit(task)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit(task);
              }
            }}
          >
            <div
              className={cn(
                'w-3 h-3 rounded-full border-2 border-white shadow-md',
                getStatusColor(task.status),
                isOverdue(task.dueDate, task.status) && 'ring-2 ring-destructive/50',
                task.status === 'blocked' && !isOverdue(task.dueDate, task.status) && 'ring-2 ring-status-blocked-fg/60',
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
                {task.assignees.map((a) => a.user?.displayName).join(', ')}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (task.startDate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
            style={{ left: getDatePosition(task.startDate) }}
            role="button"
            tabIndex={0}
            aria-label={task.title}
            onClick={() => onEdit(task)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit(task);
              }
            }}
          >
            <div
              className={cn(
                'w-3 h-3 rounded-full border-2 border-white shadow-md',
                getStatusColor(task.status),
                task.status === 'blocked' && 'ring-2 ring-status-blocked-fg/60',
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
                {task.assignees.map((a) => a.user?.displayName).join(', ')}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
