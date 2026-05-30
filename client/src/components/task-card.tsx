
import { memo } from 'react';
import { Task, TaskPriority, PRIORITY_LABELS, EFFORT_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import { getDateUrgencyInfo } from '@/lib/date-utils';
import { getPriorityDotColor, getEffortBadgeClasses } from '@/lib/style-tokens';
import { User, GripVertical } from 'lucide-react';
import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  index: number;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

const TaskCardComponent = ({ task, onClick, dragHandleProps }: TaskCardProps) => {
  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0][0]?.toUpperCase() || '';
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  // Helper to convert hex color to rgba with opacity
  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  // Visible labels (limit to 3)
  const visibleLabels = task.labels?.slice(0, 3) || [];
  const remainingLabelsCount = (task.labels?.length || 0) - visibleLabels.length;

  return (
    <div className="group bg-card rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer flex">
      {/* Drag handle - visible on hover */}
      <div
        {...dragHandleProps}
        className="flex items-center px-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {/* Card content */}
      <div
        className="flex-1 p-3 pl-1"
        role="button"
        tabIndex={0}
        onClick={() => onClick(task)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(task);
          }
        }}
      >
        {/* Title section (dominant, no priority dot) */}
        <h3
          className={cn(
            "text-sm font-medium line-clamp-2 mb-2",
            task.status === "done" && "line-through text-muted-foreground",
          )}
          title={task.title}
        >
          {task.title}
        </h3>

      {/* Label badges section */}
      {visibleLabels.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {visibleLabels.map((taskLabel) => (
            <span
              key={taskLabel.id}
              className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: taskLabel.label?.color
                  ? hexToRgba(taskLabel.label.color, 0.2)
                  : 'rgba(128, 128, 128, 0.2)',
                color: taskLabel.label?.color || '#808080',
              }}
            >
              {taskLabel.label?.name}
            </span>
          ))}
          {remainingLabelsCount > 0 && (
            <span className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium text-muted-foreground bg-muted">
              +{remainingLabelsCount}
            </span>
          )}
        </div>
      )}

      {/* Subtasks progress */}
      {totalSubtasks > 0 && (
        <div className="text-xs text-muted-foreground mb-2">
          {completedSubtasks}/{totalSubtasks} subtasks
        </div>
      )}

      {/* Footer row: priority + assignee + due date */}
      <div className="flex items-center justify-between mt-2 gap-2">
        {/* Priority indicator (dot + label) */}
        <div className="flex items-center gap-1">
          {getPriorityDotColor(task.priority) && (
            <div
              className={cn('h-2 w-2 rounded-full flex-shrink-0', getPriorityDotColor(task.priority))}
            />
          )}
          <span className="text-xs text-muted-foreground">{PRIORITY_LABELS[task.priority]}</span>
          {task.effort && (
            <span className={cn(getEffortBadgeClasses(task.effort))}>
              {EFFORT_LABELS[task.effort]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Assignee avatar */}
          <div className="flex items-center gap-1">
            {task.assignees && task.assignees.length > 0 ? (
              <>
                <div
                  className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center"
                  title={task.assignees[0].user?.displayName}
                >
                  {getInitials(task.assignees[0].user?.displayName || '')}
                </div>
                {task.assignees.length > 1 && (
                  <span className="text-xs text-muted-foreground">+{task.assignees.length - 1}</span>
                )}
              </>
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted/50 text-muted-foreground/50 flex items-center justify-center">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>

          {/* Due date */}
          {(() => {
            const urgency = getDateUrgencyInfo(task.dueDate, task.status);
            // Only show if there's a date (skip "—" on cards since space is limited)
            if (!task.dueDate) return null;
            return (
              <span className={cn('text-xs whitespace-nowrap', urgency.className)}>
                {urgency.label}
              </span>
            );
          })()}
        </div>
      </div>
      </div>
    </div>
  );
};

// Memoize TaskCard to prevent re-renders during drag-and-drop
export const TaskCard = memo(TaskCardComponent);
