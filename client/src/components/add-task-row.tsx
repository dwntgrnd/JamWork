import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "@/types";

interface AddTaskRowProps {
  isAddingTask: boolean;
  onStartAdding: () => void;
  columnCount: number;
  isDragEnabled: boolean;
  showProjectColumn: boolean;
  newTaskTitle: string;
  onTitleChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isCreatingTask: boolean;
  addTaskError: string;
  selectedProjectId: string;
  onProjectSelect: (value: string) => void;
  projects: Project[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/** The trailing "Add task" row in the task table (button → inline input). */
export function AddTaskRow({
  isAddingTask,
  onStartAdding,
  columnCount,
  isDragEnabled,
  showProjectColumn,
  newTaskTitle,
  onTitleChange,
  onKeyDown,
  isCreatingTask,
  addTaskError,
  selectedProjectId,
  onProjectSelect,
  projects,
  inputRef,
}: AddTaskRowProps) {
  return (
    <TableRow className="hover:bg-transparent border-b-0">
      {!isAddingTask ? (
        <TableCell colSpan={columnCount} className="border-b-0">
          <button
            onClick={onStartAdding}
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
                ref={inputRef}
                value={newTaskTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={onKeyDown}
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
              <p className="text-xs text-destructive mt-1 ml-1">{addTaskError}</p>
            )}
          </TableCell>
          {showProjectColumn && (
            <TableCell className="border-b-0 hidden lg:table-cell">
              <Select value={selectedProjectId} onValueChange={onProjectSelect}>
                <SelectTrigger
                  className={cn(
                    "h-8 w-full text-xs",
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
            </TableCell>
          )}
          <TableCell className="border-b-0" colSpan={4} />
        </>
      )}
    </TableRow>
  );
}
