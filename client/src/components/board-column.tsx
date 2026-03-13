
import { Task, TaskStatus } from '@/types';
import { TaskCard } from '@/components/task-card';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Inbox, ChevronDown, ChevronRight } from 'lucide-react';

interface BoardColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  isMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function BoardColumn({
  status,
  title,
  tasks,
  onTaskClick,
  onAddTask,
  isMobile,
  isCollapsed,
  onToggleCollapse,
}: BoardColumnProps) {
  return (
    <div className={`flex flex-col ${isMobile ? 'w-full' : 'w-72 min-w-[288px]'} bg-muted/50 rounded-lg`}>
      {/* Header */}
      <div className="p-3 font-semibold flex justify-between items-center">
        <div className="flex items-center gap-1">
          {isMobile && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-0.5 rounded hover:bg-muted transition-colors"
              aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
          <span>
            {title} ({tasks.length})
          </span>
        </div>

        {/* Add button in header */}
        <button
          onClick={() => onAddTask(status)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Add task to ${title}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Droppable area - hidden when collapsed on mobile */}
      {!(isMobile && isCollapsed) && (
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto ${
                snapshot.isDraggingOver ? 'bg-primary/10' : ''
              }`}
            >
              {tasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                    >
                      <TaskCard
                        task={task}
                        onClick={onTaskClick}
                        index={index}
                        dragHandleProps={provided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              {tasks.length === 0 && !snapshot.isDraggingOver && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <h3 className="text-sm font-medium text-foreground mb-1">No tasks in {title}</h3>
                  <p className="text-xs text-muted-foreground max-w-xs">Drag tasks here or create new ones.</p>
                </div>
              )}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
}
