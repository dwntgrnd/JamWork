import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListTodo, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "@/types";

interface TaskListEmptyStateProps {
  isAddingTask: boolean;
  onStartAdding: () => void;
  newTaskTitle: string;
  onTitleChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isCreatingTask: boolean;
  showProjectColumn: boolean;
  selectedProjectId: string;
  onProjectSelect: (value: string) => void;
  projects: Project[];
  addTaskError: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/** Empty-state for the task list: prompt + inline first-task entry. */
export function TaskListEmptyState({
  isAddingTask,
  onStartAdding,
  newTaskTitle,
  onTitleChange,
  onKeyDown,
  isCreatingTask,
  showProjectColumn,
  selectedProjectId,
  onProjectSelect,
  projects,
  addTaskError,
  inputRef,
}: TaskListEmptyStateProps) {
  return (
    <div>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ListTodo className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No tasks yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {isAddingTask
            ? "Create your first task below."
            : "Create a task to get started, or adjust your filters."}
        </p>
      </div>
      <div className="px-4 py-2">
        {!isAddingTask ? (
          <button
            onClick={onStartAdding}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={newTaskTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Task title..."
                className="h-8 flex-1 text-sm"
                disabled={isCreatingTask}
                autoFocus
              />
              {showProjectColumn && (
                <Select value={selectedProjectId} onValueChange={onProjectSelect}>
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
              <p className="text-xs text-destructive mt-1 ml-1">{addTaskError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
