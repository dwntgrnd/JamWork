import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { apiPut, apiPost } from "@/lib/api";
import { invalidateProjects, useProjects } from "@/hooks/use-projects";
import { useTasks, tasksKey, type TasksParams } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { queryClient } from "@/lib/query-client";
import {
  Task,
  TaskAssignee,
  TaskFilterState,
  Subtask,
} from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskTableRow } from "@/components/task-table-row";
import { AddTaskRow } from "@/components/add-task-row";
import { TaskListEmptyState } from "@/components/task-list-empty";
import { TaskLoadError } from "@/components/task-load-error";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";

interface TaskListProps {
  projectId?: string;
  assigneeId?: string;
  filters: TaskFilterState;
  refreshKey?: number;
  onRefresh?: () => void;
  onSelectionChange?: (selectedIds: Set<string>, selectedTasks: Task[]) => void;
}

// Stable empty default so `tasks` keeps a constant reference while the query is
// loading (data === undefined). A fresh [] each render would make the
// selection-sync effect below re-run every render and loop with the parent.
const EMPTY_TASKS: Task[] = [];

export function TaskList({
  projectId,
  assigneeId,
  filters,
  refreshKey,
  onRefresh,
  onSelectionChange,
}: TaskListProps) {
  const { user } = useAuth();

  // Server-side query params — TaskList sends its filters/sort to the API.
  // The old code appended both the assigneeId prop and filters.assigneeId; PHP
  // takes the last value, so filters.assigneeId wins when both are present.
  const taskParams: TasksParams = {
    projectId,
    assigneeId: filters.assigneeId || assigneeId,
    status: filters.status,
    priority: filters.priority,
    excludeCompleted: !filters.showCompleted,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  const { data: tasks = EMPTY_TASKS, isLoading: loading, isError, refetch } = useTasks(taskParams);
  const { data: users = [] } = useUsers();
  const { data: projects = [] } = useProjects();

  /** Optimistically rewrite the cached task list (preserves the old setTasks API). */
  const setTasks = (updater: Task[] | ((prev: Task[]) => Task[])) => {
    queryClient.setQueryData<Task[]>(tasksKey(taskParams), (prev = []) =>
      typeof updater === "function"
        ? (updater as (p: Task[]) => Task[])(prev)
        : updater,
    );
  };

  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [addTaskError, setAddTaskError] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );
  const tableRef = useRef<HTMLDivElement>(null);
  const addTaskInputRef = useRef<HTMLInputElement>(null);
  const [newSubtaskTitles, setNewSubtaskTitles] = useState<
    Record<string, string>
  >({});
  const [addingSubtaskForTaskId, setAddingSubtaskForTaskId] = useState<
    string | null
  >(null);
  const subtaskInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Show project column only when not viewing a specific project
  const showProjectColumn = !projectId;

  // The query refetches automatically when projectId/assigneeId/filters change
  // (they're part of the query key). The parent bumps refreshKey after creating a
  // task from the header — refetch on change, skipping the initial render.
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    refetch();
  }, [refreshKey, refetch]);

  const fetchTasks = () => refetch();

  // Keep a stable ref to avoid infinite loops when parent doesn't memoize callback
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  });

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChangeRef.current) {
      const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));
      onSelectionChangeRef.current(selectedTaskIds, selectedTasks);
    }
  }, [selectedTaskIds, tasks]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTaskIds(new Set());
    setLastSelectedIndex(null);
  }, [filters]);

  const handleRefresh = () => {
    fetchTasks();
    if (onRefresh) onRefresh();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(tasks.map((t) => t.id));
      setSelectedTaskIds(allIds);
    } else {
      setSelectedTaskIds(new Set());
    }
    setLastSelectedIndex(null);
  };

  const handleCheckboxClick = (
    taskId: string,
    index: number,
    shiftKey: boolean,
  ) => {
    const newSelected = new Set(selectedTaskIds);

    if (shiftKey && lastSelectedIndex !== null) {
      // Shift+click range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        if (tasks[i]) {
          newSelected.add(tasks[i].id);
        }
      }
    } else {
      // Normal toggle
      if (newSelected.has(taskId)) {
        newSelected.delete(taskId);
      } else {
        newSelected.add(taskId);
      }
    }

    setSelectedTaskIds(newSelected);
    setLastSelectedIndex(index);
  };

  const toggleExpanded = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
      setTimeout(() => subtaskInputRefs.current[taskId]?.focus(), 100);
    }
    setExpandedTasks(newExpanded);
  };

  const handleAddInlineSubtask = async (taskId: string) => {
    const title = newSubtaskTitles[taskId]?.trim();
    if (!title) return;

    setAddingSubtaskForTaskId(taskId);

    try {
      const data = await apiPost<{ subtask: Subtask }>(
        `/tasks/${taskId}/subtasks`,
        {
          title,
        },
      );

      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? { ...task, subtasks: [...(task.subtasks || []), data.subtask] }
            : task,
        ),
      );

      setNewSubtaskTitles((prev) => ({ ...prev, [taskId]: "" }));
      setTimeout(() => subtaskInputRefs.current[taskId]?.focus(), 50);
    } catch (err) {
      console.error("Failed to add subtask:", err);
    } finally {
      setAddingSubtaskForTaskId(null);
    }
  };

  const handleToggleSubtask = async (taskId: string, subtask: Subtask) => {
    const nextCompleted = !subtask.completed;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: task.subtasks?.map((s) =>
                s.id === subtask.id ? { ...s, completed: nextCompleted } : s,
              ),
            }
          : task,
      ),
    );
    try {
      await apiPut(`/tasks/${taskId}/subtasks/${subtask.id}`, {
        completed: nextCompleted,
      });
    } catch (err) {
      console.error("Failed to toggle subtask:", err);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                subtasks: task.subtasks?.map((s) =>
                  s.id === subtask.id ? { ...s, completed: !nextCompleted } : s,
                ),
              }
            : task,
        ),
      );
    }
  };

  const handleSubtaskInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    taskId: string,
  ) => {
    if (e.key === "Enter" && newSubtaskTitles[taskId]?.trim()) {
      e.preventDefault();
      e.stopPropagation();
      handleAddInlineSubtask(taskId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setNewSubtaskTitles((prev) => ({ ...prev, [taskId]: "" }));
      toggleExpanded(taskId);
    }
  };


  const handleInlineEdit = async (
    taskId: string,
    field: "status" | "priority" | "effort" | "dueDate" | "assigneeIds",
    value: string | number | null | string[],
  ) => {
    const fieldKey = `${taskId}-${field}`;
    setSavingFields((prev) => new Set(prev).add(fieldKey));

    try {
      const result = await apiPut<{ task: Task; clonedTask?: Task }>(
        `/tasks/${taskId}`,
        { [field]: value },
      );

      // Status changes alter a project's open-task count — refresh the sidebar badge.
      if (field === "status") {
        invalidateProjects();
      }

      // If a recurring task was marked done and cloned, refresh to show the new task
      if (result.clonedTask) {
        await fetchTasks();
      } else {
        // Optimistic update for instant visual feedback
        setTasks((prev) =>
          prev.map((task) => {
            if (task.id !== taskId) return task;
            if (field === "assigneeIds") {
              const ids = value as string[];
              const assignees: TaskAssignee[] = ids.map((uid) => {
                const u = users.find((u) => u.id === uid);
                return {
                  id: uid,
                  taskId,
                  userId: uid,
                  assignedAt: new Date().toISOString(),
                  user: u,
                };
              });
              return { ...task, assignees };
            }
            return { ...task, [field]: value };
          }),
        );
        // Silent re-fetch to re-apply server-side filters and sort order
        await fetchTasks();
      }

      // Show saved indicator briefly
      setTimeout(() => {
        setSavingFields((prev) => {
          const next = new Set(prev);
          next.delete(fieldKey);
          return next;
        });
      }, 2000);
    } catch (err: unknown) {
      console.error("Failed to save:", err);
      setSavingFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
      // Revert on error
      fetchTasks();
    }
  };

  const handleListDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;

    const reordered = Array.from(tasks);
    const [movedTask] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, movedTask);
    setTasks(reordered);

    try {
      await apiPut("/tasks/reorder", { taskIds: reordered.map((t) => t.id) });
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      fetchTasks();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only handle navigation when table is focused, not when inside an input
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    const visibleTasks = tasks;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedRowIndex((prev) =>
          prev < visibleTasks.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedRowIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (focusedRowIndex >= 0 && focusedRowIndex < visibleTasks.length) {
          setSelectedTask(visibleTasks[focusedRowIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setFocusedRowIndex(-1);
        break;
    }
  };

  const handleAddTaskKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" && newTaskTitle.trim()) {
      e.preventDefault();
      await createInlineTask();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineAdd();
    }
  };

  const handleProjectSelect = (value: string) => {
    setSelectedProjectId(value);
    setAddTaskError("");
    // Refocus the input after selecting a project
    setTimeout(() => addTaskInputRef.current?.focus(), 50);
  };

  const cancelInlineAdd = () => {
    setIsAddingTask(false);
    setNewTaskTitle("");
    setSelectedProjectId("");
    setAddTaskError("");
  };

  const createInlineTask = async () => {
    const taskProjectId = projectId || selectedProjectId;
    if (!newTaskTitle.trim()) return;
    if (!taskProjectId) {
      setAddTaskError("Select a project first");
      return;
    }

    setAddTaskError("");
    setIsCreatingTask(true);
    const title = newTaskTitle.trim();

    // Build optimistic task
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempId,
      title,
      status: "todo",
      priority: "medium",
      sortOrder: tasks.length,
      projectId: taskProjectId,
      createdById: user?.id || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignees: user
        ? [
            {
              id: tempId,
              taskId: tempId,
              userId: user.id,
              assignedAt: new Date().toISOString(),
              user: {
                id: user.id,
                email: "",
                displayName: user.displayName,
                role: user.role,
              },
            },
          ]
        : [],
      subtasks: [],
      labels: [],
    };

    // Optimistic update
    setTasks((prev) => [...prev, optimisticTask]);
    setNewTaskTitle("");

    try {
      const result = await apiPost<{ task: Task }>("/tasks", {
        title,
        status: "todo",
        priority: "medium",
        projectId: taskProjectId,
        assigneeIds: user ? [user.id] : [],
      });

      // Replace optimistic task with real task
      setTasks((prev) => prev.map((t) => (t.id === tempId ? result.task : t)));
      invalidateProjects();
    } catch (err) {
      console.error("Failed to create task:", err);
      // Remove optimistic task on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    } finally {
      setIsCreatingTask(false);
      // Keep input active for continuous entry
      setTimeout(() => addTaskInputRef.current?.focus(), 50);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <TaskLoadError onRetry={() => refetch()} />;
  }

  if (tasks.length === 0) {
    return (
      <TaskListEmptyState
        isAddingTask={isAddingTask}
        onStartAdding={() => setIsAddingTask(true)}
        newTaskTitle={newTaskTitle}
        onTitleChange={setNewTaskTitle}
        onKeyDown={handleAddTaskKeyDown}
        isCreatingTask={isCreatingTask}
        showProjectColumn={showProjectColumn}
        selectedProjectId={selectedProjectId}
        onProjectSelect={handleProjectSelect}
        projects={projects}
        addTaskError={addTaskError}
        inputRef={addTaskInputRef}
      />
    );
  }

  const isDragEnabled = filters.sortBy === "sortOrder";

  // Calculate column count for colspan
  // drag + checkbox + caret + title + project? + status + priority + effort + assignee + due date
  const columnCount =
    (isDragEnabled ? 1 : 0) +
    1 +
    1 +
    1 +
    (showProjectColumn ? 1 : 0) +
    1 +
    1 +
    1 +
    1 +
    1;

  return (
    <>
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg overflow-x-auto"
      >
        <DragDropContext onDragEnd={handleListDragEnd}>
          <Table className="table-fixed [&_td]:py-1.5">
            <TableHeader>
              <TableRow>
                {isDragEnabled && <TableHead className="w-12"></TableHead>}
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      tasks.length > 0 && selectedTaskIds.size === tasks.length
                        ? true
                        : selectedTaskIds.size > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-[35%]">Title</TableHead>
                <TableHead className="w-24 hidden sm:table-cell">
                  Due Date
                </TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-20 hidden lg:table-cell">
                  Effort
                </TableHead>
                <TableHead className="w-24 hidden md:table-cell">
                  Assignee
                </TableHead>
                {showProjectColumn && (
                  <TableHead className="w-36 hidden lg:table-cell">
                    Project
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <Droppable droppableId="task-list" isDropDisabled={!isDragEnabled}>
              {(provided, snapshot) => (
                <TableBody
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    snapshot.isDraggingOver &&
                      isDragEnabled &&
                      "bg-interactive/10",
                  )}
                >
                  {tasks.map((task, index) => (
                    <TaskTableRow
                      key={task.id}
                      task={task}
                      index={index}
                      isDragEnabled={isDragEnabled}
                      showProjectColumn={showProjectColumn}
                      isExpanded={expandedTasks.has(task.id)}
                      isFocused={index === focusedRowIndex}
                      isSelected={selectedTaskIds.has(task.id)}
                      savingFields={savingFields}
                      users={users}
                      newSubtaskTitle={newSubtaskTitles[task.id] || ""}
                      isAddingSubtask={addingSubtaskForTaskId === task.id}
                      subtaskInputRef={(el) => {
                        subtaskInputRefs.current[task.id] = el;
                      }}
                      onRowClick={() => {
                        if (selectedTaskIds.size > 0) {
                          handleCheckboxClick(task.id, index, false);
                        } else {
                          setSelectedTask(task);
                        }
                      }}
                      onCheckboxClick={(shiftKey) =>
                        handleCheckboxClick(task.id, index, shiftKey)
                      }
                      onToggleExpand={() => toggleExpanded(task.id)}
                      onInlineEdit={(field, value) =>
                        handleInlineEdit(task.id, field, value)
                      }
                      onToggleSubtask={(subtask) =>
                        handleToggleSubtask(task.id, subtask)
                      }
                      onSubtaskTitleChange={(value) =>
                        setNewSubtaskTitles((prev) => ({
                          ...prev,
                          [task.id]: value,
                        }))
                      }
                      onSubtaskInputKeyDown={(e) =>
                        handleSubtaskInputKeyDown(e, task.id)
                      }
                    />
                  ))}
                  {provided.placeholder}
                  <AddTaskRow
                    isAddingTask={isAddingTask}
                    onStartAdding={() => setIsAddingTask(true)}
                    columnCount={columnCount}
                    isDragEnabled={isDragEnabled}
                    showProjectColumn={showProjectColumn}
                    newTaskTitle={newTaskTitle}
                    onTitleChange={setNewTaskTitle}
                    onKeyDown={handleAddTaskKeyDown}
                    isCreatingTask={isCreatingTask}
                    addTaskError={addTaskError}
                    selectedProjectId={selectedProjectId}
                    onProjectSelect={handleProjectSelect}
                    projects={projects}
                    inputRef={addTaskInputRef}
                  />
                </TableBody>
              )}
            </Droppable>
          </Table>
        </DragDropContext>
      </div>

      {/* Task Edit Drawer */}
      {selectedTask && (
        <TaskDrawer
          mode="edit"
          task={selectedTask}
          onSave={() => {
            handleRefresh();
            setSelectedTask(null);
          }}
          onClose={() => {
            handleRefresh();
            setSelectedTask(null);
          }}
        />
      )}
    </>
  );
}
