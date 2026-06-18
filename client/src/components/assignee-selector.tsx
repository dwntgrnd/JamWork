import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { UserSummary } from '@/types';

interface AssigneeSelectorProps {
  users: UserSummary[];
  selectedAssignees: string[];
  onToggle: (userId: string) => void;
  /** Id of the property-row label that names this group for screen readers. */
  labelledById?: string;
}

/** Toggleable assignee badges for the task drawer (label supplied by the row). */
export function AssigneeSelector({ users, selectedAssignees, onToggle, labelledById }: AssigneeSelectorProps) {
  return (
    <div role="group" aria-labelledby={labelledById} className="flex flex-wrap gap-1.5">
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
  );
}
