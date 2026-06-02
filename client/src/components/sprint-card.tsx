import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Check, ChevronDown, ChevronRight, ArrowRight, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusPillClasses, formatStatusLabel, getAvatarColor } from '@/lib/style-tokens';
import { Sprint, Task } from '@/types';

type SprintWithTasks = Sprint & {
  tasks?: (Task & { project?: { id: string; name: string } })[];
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

interface SprintCardProps {
  sprint: SprintWithTasks;
  isActive: boolean;
  isExpanded: boolean;
  moveTargets: SprintWithTasks[];
  onToggleExpand: (id: string) => void;
  onEdit: (sprint: SprintWithTasks) => void;
  onClose?: (sprint: SprintWithTasks) => void;
  onAddTask?: (sprintId: string) => void;
  onMoveTask: (taskId: string, targetSprintId: string | null, sprintName?: string) => void;
  onTaskClick: (task: Task) => void;
}

/** A sprint card (active or completed) with an expandable, project-grouped task list. */
export function SprintCard({
  sprint,
  isActive,
  isExpanded,
  moveTargets,
  onToggleExpand,
  onEdit,
  onClose,
  onAddTask,
  onMoveTask,
  onTaskClick,
}: SprintCardProps) {
  const totalTasks = sprint.stats?.taskCount ?? sprint._count?.tasks ?? sprint.tasks?.length ?? 0;
  const completedTasks = sprint.stats?.completedCount ?? sprint.tasks?.filter((t) => t.status === 'done').length ?? 0;
  const projectGroups = sprint.tasks ? groupTasksByProject(sprint.tasks) : [];

  return (
    <Card
      className={cn(
        'px-3 py-2.5 group',
        !isActive && 'opacity-75 hover:opacity-100 transition-opacity',
      )}
    >
      <div
        className="flex items-start gap-2 cursor-pointer select-none"
        onClick={() => onToggleExpand(sprint.id)}
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
            <span className="font-semibold text-sm text-foreground truncate">{sprint.name}</span>
            {isActive ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-interactive/15 text-interactive-foreground font-medium whitespace-nowrap flex-shrink-0">
                Active
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap flex-shrink-0">
                Completed
              </span>
            )}
            {sprint.project && (
              <span className="text-xs text-muted-foreground truncate flex-shrink-0">
                {sprint.project.name}
              </span>
            )}
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(sprint);
              }}
              aria-label={`Edit ${sprint.name}`}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {isActive && onClose && (
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(sprint);
                }}
                aria-label={`Close ${sprint.name}`}
              >
                <Check className="h-3.5 w-3.5" />
                Close
              </button>
            )}
          </div>
          {/* Line 2: dates + count (+ progress for active) */}
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span>{formatDateRange(sprint.startDate, sprint.endDate)}</span>
            <span>&middot;</span>
            <span>{totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</span>
            {isActive && (
              <>
                <span>&middot;</span>
                <span>{completedTasks} of {totalTasks} complete</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Task View */}
      {isExpanded && (
        <div className="mt-3 ml-6">
          {sprint.description && (
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{sprint.description}</p>
          )}
          {projectGroups.length === 0 ? (
            isActive && onAddTask ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <span>No tasks in this sprint</span>
                <span>&middot;</span>
                <button
                  className="text-primary hover:underline font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTask(sprint.id);
                  }}
                >
                  Add task
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No tasks in this sprint</p>
            )
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
                          onClick={() => onTaskClick(task)}
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
                                  onMoveTask(task.id, null);
                                } else {
                                  const targetSprint = moveTargets.find((s) => s.id === value);
                                  onMoveTask(task.id, value, targetSprint?.name);
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
                                {moveTargets.map((s) => (
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
              {isActive && onAddTask && (
                <button
                  className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTask(sprint.id);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add task
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
