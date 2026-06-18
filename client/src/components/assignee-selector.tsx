import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { UserSummary } from '@/types';

interface AssigneeSelectorProps {
  users: UserSummary[];
  selectedAssignees: string[];
  onToggle: (userId: string) => void;
}

/** Toggleable assignee badges for the task drawer. */
export function AssigneeSelector({ users, selectedAssignees, onToggle }: AssigneeSelectorProps) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground mb-2">Assignees</h3>
      <div className="flex flex-wrap gap-2">
        {users.map((user) => {
          const selected = selectedAssignees.includes(user.id);
          return (
            <Badge
              key={user.id}
              asChild
              variant={selected ? 'default' : 'outline'}
              className="cursor-pointer text-sm font-medium"
            >
              <button type="button" aria-pressed={selected} onClick={() => onToggle(user.id)}>
                {selected && <Check className="h-3 w-3 mr-1" />}
                {user.displayName}
              </button>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
