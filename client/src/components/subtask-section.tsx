import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Subtask } from "@/types";

interface SubtaskSectionProps {
  subtasks: Subtask[];
  newSubtaskTitle: string;
  isAddingSubtask: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onTitleChange: (value: string) => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** The expanded subtask list + inline "add subtask" input shown under a task row. */
export function SubtaskSection({
  subtasks,
  newSubtaskTitle,
  isAddingSubtask,
  inputRef,
  onToggleSubtask,
  onTitleChange,
  onInputKeyDown,
}: SubtaskSectionProps) {
  return (
    <div className="mt-2 space-y-1">
      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Checkbox
            checked={subtask.completed}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() => onToggleSubtask(subtask)}
          />
          <span
            className={cn(
              subtask.completed && "line-through text-muted-foreground",
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
          ref={inputRef}
          value={newSubtaskTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          onClick={(e) => e.stopPropagation()}
          placeholder="Add a subtask..."
          className="h-7 flex-1 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
          disabled={isAddingSubtask}
        />
        {isAddingSubtask && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>
    </div>
  );
}
