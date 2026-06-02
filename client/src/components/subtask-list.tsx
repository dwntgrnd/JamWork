import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Subtask } from '@/types';

interface SubtaskListProps {
  subtasks: Subtask[];
  newSubtaskTitle: string;
  onNewSubtaskTitleChange: (v: string) => void;
  onAdd: () => void;
  onToggle: (subtask: Subtask) => void;
  onDelete: (subtaskId: string) => void;
}

/** Subtask checklist with inline add (task drawer, edit mode). */
export function SubtaskList({
  subtasks,
  newSubtaskTitle,
  onNewSubtaskTitleChange,
  onAdd,
  onToggle,
  onDelete,
}: SubtaskListProps) {
  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-muted-foreground">Subtasks</span>
        {subtasks.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {completedSubtasksCount}/{subtasks.length} complete
          </Badge>
        )}
      </div>

      {/* Subtask list */}
      <div className="space-y-2">
        {subtasks.map((subtask) => (
          <div key={subtask.id} className="flex items-center gap-2 group">
            <Checkbox checked={subtask.completed} onCheckedChange={() => onToggle(subtask)} />
            <span
              className={cn(
                'flex-1 text-sm',
                subtask.completed && 'line-through text-muted-foreground'
              )}
            >
              {subtask.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(subtask.id)}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add subtask */}
      <div className="flex items-center gap-2 mt-2 border-b border-dashed border-field-border pb-1">
        <Plus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <Input
          placeholder="Add a subtask..."
          value={newSubtaskTitle}
          onChange={(e) => onNewSubtaskTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          className="flex-1 h-8 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );
}
