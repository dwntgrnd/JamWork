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
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Assignees</h3>
      <div className="flex flex-wrap gap-2">
        {users.map((user) => (
          <Badge
            key={user.id}
            variant={selectedAssignees.includes(user.id) ? 'default' : 'outline'}
            className="cursor-pointer text-sm font-medium"
            onClick={() => onToggle(user.id)}
          >
            {selectedAssignees.includes(user.id) && <Check className="h-3 w-3 mr-1" />}
            {user.displayName}
          </Badge>
        ))}
      </div>
    </div>
  );
}
