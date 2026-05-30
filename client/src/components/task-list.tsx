import { useEffect, useState, useRef, useCallback, KeyboardEvent } from "react";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import {
  Task,
  TaskAssignee,
  TaskEffort,
  TaskFilterState,
  TaskStatus,
  TaskPriority,
  STATUS_LABELS,
  PRIORITY_LABELS,
  EFFORT_LABELS,
  UserSummary,
  Project,
  Subtask,
} from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { TaskDrawer } from "@/components/task-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  ChevronRight,
  ChevronDown,
  Check,
  GripVertical,
  ListTodo,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, getDateUrgencyInfo } from "@/lib/date-utils";
import {
  getStatusChipClasses,
  getPriorityDotColor,
  getEffortBadgeClasses,
  getAvatarColor,
} from "@/lib/style-tokens";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { toast } from "sonner";

interface TaskListProps {
  projectId?: string;
  assigneeId?: string;
  filters: TaskFilterState;
  refreshKey?: number;
  onRefresh?: () => void;
  onSelectionChange?: (selectedIds: Set<string>, selectedTasks: Task[]) => void;
}

export function TaskList({
  projectId,
  assigneeId,
  filters,
  refreshKey,
  onRefresh,
  onSelectionChange,
}: TaskListProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    if (!projectId) {
      fetchProjects();
    }
  }, [projectId, assigneeId, filters, refreshKey]);

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

  const fetchUsers = async () => {
    try {
      const data = await apiGet<{ users: UserSummary[] }>("/auth/users");
      setUsers(data.users);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast.error("Failed to load team members");
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiGet<{ projects: Project[] }>("/projects");
      setProjects(data.projects);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      toast.error("Failed to load projects");
    }
  };

  const fetchTasks = async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }

      // Build query params
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      if (assigneeId) params.append("assigneeId", assigneeId);
      if (filters.status) params.append("status", filters.status);
      if (filters.priority) params.append("priority", filters.priority);
      if (filters.assigneeId) params.append("assigneeId", filters.assigneeId);
      if (!filters.showCompleted) params.append("excludeCompleted", "true");
      params.append("sortBy", filters.sortBy);
      params.append("sortDir", filters.sortDir);

      const data = await apiGet<{ tasks: Task[] }>(
        `/tasks?${params.toString()}`,
      );
      setTasks(data.tasks);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const handleRefresh = () => {
    fetchTasks();
    if (onRefresh) onRefresh();
  };

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
    setLastSelectedIndex(null);
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

  const getFirstName = (displayName?: string) =>
    displayName?.split(" ")[0] || "?";

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
        window.dispatchEvent(new Event('projects-updated'));
      }

      // If a recurring task was marked done and cloned, refresh to show the new task
      if (result.clonedTask) {
        await fetchTasks({ silent: true });
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
        await fetchTasks({ silent: true });
      }

      // Show saved indicator briefly
      setTimeout(() => {
        setSavingFields((prev) => {
          const next = new Set(prev);
          next.delete(fieldKey);
          return next;
        });
      }, 2000);
    } catch (err: any) {
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
                role: user.role as any,
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
      window.dispatchEvent(new Event('projects-updated'));
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

  if (tasks.length === 0 && !isAddingTask) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListTodo className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            No tasks yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Create a task to get started, or adjust your filters.
          </p>
        </div>
        {/* Inline add row below empty state */}
        <div className="px-4 py-2">
          <button
            onClick={() => setIsAddingTask(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        </div>
      </div>
    );
  }

  if (tasks.length === 0 && isAddingTask) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListTodo className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            No tasks yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Create your first task below.
          </p>
        </div>
        <div className="px-4 py-2">
          <div>
            <div className="flex items-center gap-2">
              <Input
                ref={addTaskInputRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleAddTaskKeyDown}
                placeholder="Task title..."
                className="h-8 flex-1 text-sm"
                disabled={isCreatingTask}
                autoFocus
              />
              {!projectId && (
                <Select
                  value={selectedProjectId}
                  onValueChange={handleProjectSelect}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-40 text-xs",
                      addTaskError && !selectedProjectId && "border-red-400",
                    )}
                  >
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isCreatingTask && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {addTaskError && (
              <p className="text-xs text-destructive mt-1 ml-1">
                {addTaskError}
              </p>
            )}
          </div>
        </div>
      </div>
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
                {showProjectColumn && (
                  <TableHead className="w-36 hidden lg:table-cell">
                    Project
                  </TableHead>
                )}
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-20 hidden lg:table-cell">
                  Effort
                </TableHead>
                <TableHead className="w-24 hidden sm:table-cell">
                  Assignee
                </TableHead>
                <TableHead className="w-24 hidden md:table-cell">
                  Due Date
                </TableHead>
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
                  {tasks.map((task, index) => {
                    const isExpanded = expandedTasks.has(task.id);
                    const isFocused = index === focusedRowIndex;
                    const hasSubtasks =
                      task.subtasks && task.subtasks.length > 0;
                    const completedSubtasks =
                      task.subtasks?.filter((s) => s.completed).length || 0;
                    const totalSubtasks = task.subtasks?.length || 0;

                    return (
                      <Draggable
                        key={task.id}
                        draggableId={task.id}
                        index={index}
                        isDragDisabled={!isDragEnabled}
                      >
                        {(provided, snapshot) => (
                          <TableRow
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "group cursor-pointer border-b border-border hover:bg-muted/50 hover:shadow-sm transition-all duration-150",
                              isFocused && "ring-2 ring-ring",
                              snapshot.isDragging && "shadow-lg bg-card",
                            )}
                            onClick={() => {
                              // If any tasks are selected, clicking row toggles checkbox instead of opening drawer
                              if (selectedTaskIds.size > 0) {
                                handleCheckboxClick(task.id, index, false);
                              } else {
                                setSelectedTask(task);
                              }
                            }}
                          >
                            {isDragEnabled && (
                              <TableCell
                                {...provided.dragHandleProps}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            )}
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedTaskIds.has(task.id)}
                                onCheckedChange={() =>
                                  handleCheckboxClick(task.id, index, false)
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCheckboxClick(
                                    task.id,
                                    index,
                                    e.shiftKey,
                                  );
                                }}
                                className="transition-colors"
                              />
                            </TableCell>

                            {/* Expand/collapse caret */}
                            <TableCell className="px-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-6 w-6 p-0 shrink-0 transition-opacity",
                                  hasSubtasks
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100",
                                )}
                                aria-label={
                                  isExpanded
                                    ? "Collapse subtasks"
                                    : "Expand subtasks"
                                }
                                aria-expanded={isExpanded}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpanded(task.id);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>

                            {/* Title */}
                            <TableCell className="max-w-0 w-[35%]">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-left hover:text-interactive text-sm font-semibold truncate",
                                    task.status === "done" &&
                                      "line-through text-muted-foreground",
                                  )}
                                  title={task.title}
                                >
                                  {task.title}
                                </span>
                                {hasSubtasks && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs shrink-0"
                                  >
                                    {completedSubtasks}/{totalSubtasks}
                                  </Badge>
                                )}
                              </div>

                              {/* Expanded subtask section */}
                              {isExpanded && (
                                <div className="mt-2 space-y-1">
                                  {task.subtasks?.map((subtask) => (
                                    <div
                                      key={subtask.id}
                                      className="flex items-center gap-2 text-sm text-muted-foreground"
                                    >
                                      <Checkbox
                                        checked={subtask.completed}
                                        onClick={(e) => e.stopPropagation()}
                                        onCheckedChange={() =>
                                          handleToggleSubtask(task.id, subtask)
                                        }
                                      />
                                      <span
                                        className={cn(
                                          subtask.completed &&
                                            "line-through text-muted-foreground",
                                        )}
                                      >
                                        {subtask.title}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Inline add subtask input */}
                                  <div className="flex items-center gap-2 mt-1">
                                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <Input
                                      ref={(el) => {
                                        subtaskInputRefs.current[task.id] = el;
                                      }}
                                      value={newSubtaskTitles[task.id] || ""}
                                      onChange={(e) =>
                                        setNewSubtaskTitles((prev) => ({
                                          ...prev,
                                          [task.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) =>
                                        handleSubtaskInputKeyDown(e, task.id)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="Add a subtask..."
                                      className="h-7 flex-1 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
                                      disabled={
                                        addingSubtaskForTaskId === task.id
                                      }
                                    />
                                    {addingSubtaskForTaskId === task.id && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                                    )}
                                  </div>
                                </div>
                              )}
                            </TableCell>

                            {/* Project */}
                            {showProjectColumn && (
                              <TableCell className="hidden lg:table-cell">
                                {task.project ? (
                                  <Link
                                    to={`/projects/${task.project.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-muted-foreground hover:text-foreground hover:underline truncate block max-w-[160px]"
                                    title={task.project.name}
                                  >
                                    {task.project.name}
                                  </Link>
                                ) : (
                                  <span className="text-sm text-muted-foreground/50">
                                    &mdash;
                                  </span>
                                )}
                              </TableCell>
                            )}

                            {/* Status - inline editable */}
                            <TableCell>
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Select
                                  value={task.status}
                                  onValueChange={(value) =>
                                    handleInlineEdit(task.id, "status", value)
                                  }
                                >
                                  <SelectTrigger
                                    className={cn(
                                      "h-7 w-30 border-none",
                                      getStatusChipClasses(task.status),
                                    )}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="todo">
                                      {STATUS_LABELS.todo}
                                    </SelectItem>
                                    <SelectItem value="in_progress">
                                      {STATUS_LABELS.in_progress}
                                    </SelectItem>
                                    <SelectItem value="blocked">
                                      {STATUS_LABELS.blocked}
                                    </SelectItem>
                                    <SelectItem value="review">
                                      {STATUS_LABELS.review}
                                    </SelectItem>
                                    <SelectItem value="done">
                                      {STATUS_LABELS.done}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {savingFields.has(`${task.id}-status`) && (
                                  <Check className="h-3 w-3 text-success" />
                                )}
                              </div>
                            </TableCell>

                            {/* Priority - inline editable */}
                            <TableCell>
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {getPriorityDotColor(task.priority) && (
                                  <div
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full shrink-0",
                                      getPriorityDotColor(task.priority),
                                    )}
                                  />
                                )}
                                <Select
                                  value={task.priority}
                                  onValueChange={(value) =>
                                    handleInlineEdit(task.id, "priority", value)
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs border-none bg-transparent px-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">
                                      {PRIORITY_LABELS.low}
                                    </SelectItem>
                                    <SelectItem value="medium">
                                      {PRIORITY_LABELS.medium}
                                    </SelectItem>
                                    <SelectItem value="high">
                                      {PRIORITY_LABELS.high}
                                    </SelectItem>
                                    <SelectItem value="urgent">
                                      {PRIORITY_LABELS.urgent}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {savingFields.has(`${task.id}-priority`) && (
                                  <Check className="h-3 w-3 text-success" />
                                )}
                              </div>
                            </TableCell>

                            {/* Effort - inline editable */}
                            <TableCell className="hidden lg:table-cell">
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Select
                                  value={
                                    task.effort ? task.effort.toString() : "none"
                                  }
                                  onValueChange={(v) =>
                                    handleInlineEdit(
                                      task.id,
                                      "effort",
                                      v === "none" ? null : parseInt(v),
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    className={cn(
                                      "h-7 w-auto min-w-0 gap-0.5 px-2 border-none text-xs",
                                      task.effort
                                        ? getEffortBadgeClasses(task.effort)
                                        : "text-muted-foreground/50",
                                    )}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="1">
                                      {EFFORT_LABELS[1]}
                                    </SelectItem>
                                    <SelectItem value="2">
                                      {EFFORT_LABELS[2]}
                                    </SelectItem>
                                    <SelectItem value="4">
                                      {EFFORT_LABELS[4]}
                                    </SelectItem>
                                    <SelectItem value="8">
                                      {EFFORT_LABELS[8]}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {savingFields.has(`${task.id}-effort`) && (
                                  <Check className="h-3 w-3 text-success" />
                                )}
                              </div>
                            </TableCell>

                            {/* Assignees - inline editable */}
                            <TableCell className="hidden sm:table-cell">
                              <div onClick={(e) => e.stopPropagation()}>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className={cn(
                                        "flex items-center gap-1 text-sm h-7 px-1 rounded hover:bg-muted/50 transition-colors",
                                        task.assignees &&
                                          task.assignees.length > 0
                                          ? "text-foreground"
                                          : "text-muted-foreground/50",
                                      )}
                                    >
                                      {task.assignees &&
                                      task.assignees.length > 0 ? (
                                        <span className="truncate max-w-[80px]">
                                          {getFirstName(
                                            task.assignees[0]?.user
                                              ?.displayName,
                                          )}
                                          {task.assignees.length > 1 && (
                                            <span className="text-muted-foreground ml-1">
                                              +{task.assignees.length - 1}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span>&mdash;</span>
                                      )}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-52 p-2"
                                    align="start"
                                  >
                                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                      {users.map((u) => {
                                        const isAssigned =
                                          task.assignees?.some(
                                            (a) => a.userId === u.id,
                                          ) || false;
                                        return (
                                          <label
                                            key={u.id}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded cursor-pointer text-sm"
                                          >
                                            <Checkbox
                                              checked={isAssigned}
                                              onCheckedChange={() => {
                                                const currentIds =
                                                  task.assignees?.map(
                                                    (a) => a.userId,
                                                  ) || [];
                                                const newIds = isAssigned
                                                  ? currentIds.filter(
                                                      (id) => id !== u.id,
                                                    )
                                                  : [...currentIds, u.id];
                                                handleInlineEdit(
                                                  task.id,
                                                  "assigneeIds",
                                                  newIds,
                                                );
                                              }}
                                            />
                                            <span>{u.displayName}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    {task.assignees &&
                                      task.assignees.length > 0 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full mt-1 text-xs text-muted-foreground"
                                          onClick={() =>
                                            handleInlineEdit(
                                              task.id,
                                              "assigneeIds",
                                              [],
                                            )
                                          }
                                        >
                                          Clear all
                                        </Button>
                                      )}
                                  </PopoverContent>
                                </Popover>
                                {savingFields.has(
                                  `${task.id}-assigneeIds`,
                                ) && (
                                  <Check className="h-3 w-3 text-success inline-block ml-1" />
                                )}
                              </div>
                            </TableCell>

                            {/* Due Date - inline editable */}
                            <TableCell className="hidden md:table-cell">
                              <div onClick={(e) => e.stopPropagation()}>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="text-left h-7 px-1 rounded hover:bg-muted/50 transition-colors">
                                      {(() => {
                                        const urgency = getDateUrgencyInfo(
                                          task.dueDate,
                                          task.status,
                                        );
                                        return (
                                          <span
                                            className={cn(
                                              "text-xs whitespace-nowrap",
                                              urgency.className,
                                            )}
                                          >
                                            {urgency.label}
                                          </span>
                                        );
                                      })()}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-auto p-3"
                                    align="start"
                                  >
                                    <div className="flex flex-col gap-2">
                                      <Input
                                        type="date"
                                        value={
                                          task.dueDate
                                            ? new Date(task.dueDate)
                                                .toISOString()
                                                .split("T")[0]
                                            : ""
                                        }
                                        onChange={(e) =>
                                          handleInlineEdit(
                                            task.id,
                                            "dueDate",
                                            e.target.value
                                              ? new Date(
                                                  e.target.value,
                                                ).toISOString()
                                              : null,
                                          )
                                        }
                                        className="h-8 text-sm"
                                      />
                                      {task.dueDate && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs text-muted-foreground"
                                          onClick={() =>
                                            handleInlineEdit(
                                              task.id,
                                              "dueDate",
                                              null,
                                            )
                                          }
                                        >
                                          Clear
                                        </Button>
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                {savingFields.has(`${task.id}-dueDate`) && (
                                  <Check className="h-3 w-3 text-success inline-block ml-1" />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  {/* Inline add task row */}
                  <TableRow className="hover:bg-transparent border-b-0">
                    {!isAddingTask ? (
                      <TableCell colSpan={columnCount} className="border-b-0">
                        <button
                          onClick={() => setIsAddingTask(true)}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1 w-full transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Add task
                        </button>
                      </TableCell>
                    ) : (
                      <>
                        {isDragEnabled && <TableCell className="border-b-0" />}
                        <TableCell className="border-b-0" />
                        <TableCell className="border-b-0" />
                        <TableCell className="border-b-0">
                          <div className="flex items-center gap-2">
                            <Input
                              ref={addTaskInputRef}
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              onKeyDown={handleAddTaskKeyDown}
                              placeholder="Task title..."
                              className="h-8 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent"
                              disabled={isCreatingTask}
                              autoFocus
                            />
                            {isCreatingTask && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          {addTaskError && (
                            <p className="text-xs text-destructive mt-1 ml-1">
                              {addTaskError}
                            </p>
                          )}
                        </TableCell>
                        {showProjectColumn && (
                          <TableCell className="border-b-0 hidden lg:table-cell">
                            {!projectId && (
                              <Select
                                value={selectedProjectId}
                                onValueChange={handleProjectSelect}
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-8 w-full text-xs",
                                    addTaskError &&
                                      !selectedProjectId &&
                                      "border-red-400",
                                  )}
                                >
                                  <SelectValue placeholder="Project" />
                                </SelectTrigger>
                                <SelectContent>
                                  {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="border-b-0" colSpan={4} />
                      </>
                    )}
                  </TableRow>
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
