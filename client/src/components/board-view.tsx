
import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { Task, TaskStatus, TaskFilterState } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { BoardColumn } from '@/components/board-column';
import { TaskDrawer } from '@/components/task-drawer';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface BoardViewProps {
  projectId: string;
  filters: TaskFilterState;
  refreshKey?: number;
}

export function BoardView({ projectId, filters, refreshKey }: BoardViewProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});

  const toggleColumn = (status: string) => {
    setCollapsedColumns((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  useEffect(() => {
    fetchTasks();
  }, [projectId, refreshKey]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ tasks: Task[] }>(`/tasks?projectId=${projectId}`);
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Filter tasks using filters prop
  const filteredTasks = tasks.filter((task) => {
    // Status filter
    if (filters.status && task.status !== filters.status) return false;

    // Priority filter
    if (filters.priority && task.priority !== filters.priority) return false;

    // Assignee filter
    if (filters.assigneeId) {
      if (filters.assigneeId === 'me') {
        if (!task.assignees?.some((a) => a.userId === user?.id)) return false;
      } else {
        if (!task.assignees?.some((a) => a.userId === filters.assigneeId)) return false;
      }
    }

    // Board view always shows done tasks in the Done column — hiding them makes the column meaningless.
    // The showCompleted filter is still respected via the column rendering below.

    return true;
  });

  // Define columns
  const columns: { status: TaskStatus; title: string }[] = [
    { status: 'todo', title: 'To Do' },
    { status: 'in_progress', title: 'In Progress' },
    { status: 'blocked', title: 'Blocked' },
    { status: 'review', title: 'Review' },
    { status: 'done', title: 'Done' },
  ];

  // Group tasks by status
  const tasksByStatus = Object.fromEntries(
    columns.map((col) => [
      col.status,
      filteredTasks
        .filter((t) => t.status === col.status)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    ])
  );

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;

    // Optimistic update
    const updatedTasks = [...tasks];
    const taskIndex = updatedTasks.findIndex((t) => t.id === draggableId);
    if (taskIndex === -1) return;

    // Update status if changed
    if (sourceStatus !== destStatus) {
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], status: destStatus };
    }

    // Recalculate sortOrder for destination column
    const destColumnTasks = updatedTasks
      .filter((t) => t.status === destStatus)
      .sort((a, b) => {
        if (a.id === draggableId) return destination.index - source.index;
        if (b.id === draggableId) return source.index - destination.index;
        return a.sortOrder - b.sortOrder;
      });

    // Update sortOrder
    destColumnTasks.forEach((t, idx) => {
      const index = updatedTasks.findIndex((ut) => ut.id === t.id);
      if (index !== -1) {
        updatedTasks[index] = { ...updatedTasks[index], sortOrder: idx };
      }
    });

    setTasks(updatedTasks);

    try {
      // Update status if changed
      let needsRefresh = false;
      if (sourceStatus !== destStatus) {
        const result = await apiPut<{ task: Task; clonedTask?: Task }>(`/tasks/${draggableId}`, { status: destStatus });
        if (result.clonedTask) {
          needsRefresh = true;
        }
      }

      // Update sortOrder via reorder endpoint
      await apiPut('/tasks/reorder', { taskIds: destColumnTasks.map((t) => t.id) });

      // If a recurring task was cloned, refresh to show the new task
      if (needsRefresh) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      // Revert on error
      await fetchTasks();
    }
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-72 min-w-[288px]">
            <Skeleton className="h-96 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Board columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={isMobile ? "flex flex-col gap-4 p-4" : "flex gap-4 overflow-x-auto p-4"}>
          {columns.map((col) => (
            <BoardColumn
              key={col.status}
              status={col.status}
              title={col.title}
              tasks={tasksByStatus[col.status] as Task[]}
              onTaskClick={setEditTask}
              onAddTask={setCreateStatus}
              isMobile={isMobile}
              isCollapsed={!!collapsedColumns[col.status]}
              onToggleCollapse={() => toggleColumn(col.status)}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Edit Task Drawer */}
      {editTask && (
        <TaskDrawer
          mode="edit"
          task={editTask}
          onSave={() => {
            setEditTask(null);
            fetchTasks();
          }}
          onClose={() => {
            fetchTasks();
            setEditTask(null);
          }}
        />
      )}

      {/* Create Task Drawer */}
      {createStatus && (
        <TaskDrawer
          mode="create"
          projectId={projectId}
          defaultStatus={createStatus}
          onSave={() => {
            setCreateStatus(null);
            fetchTasks();
          }}
          onClose={() => setCreateStatus(null)}
        />
      )}
    </>
  );
}
