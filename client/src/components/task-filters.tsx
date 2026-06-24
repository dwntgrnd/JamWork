
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { TaskFilterState, TaskStatus, TaskPriority, STATUS_LABELS, PRIORITY_LABELS, UserSummary } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TaskFiltersProps {
  filters: TaskFilterState;
  onChange: (filters: TaskFilterState) => void;
  hideProjectFilter?: boolean;
}

export function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const [users, setUsers] = useState<UserSummary[]>([]);

  // Compute active filter count (non-default values)
  const activeFilterCount = [
    filters.status,
    filters.priority,
    filters.assigneeId,
    !filters.showCompleted,
  ].filter(Boolean).length;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiGet<{ users: UserSummary[] }>('/auth/users');
        setUsers(data.users);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  const handleStatusChange = (value: string) => {
    onChange({
      ...filters,
      status: value === 'all' ? undefined : (value as TaskStatus),
    });
  };

  const handlePriorityChange = (value: string) => {
    onChange({
      ...filters,
      priority: value === 'all' ? undefined : (value as TaskPriority),
    });
  };

  const handleAssigneeChange = (value: string) => {
    onChange({
      ...filters,
      assigneeId: value === 'all' ? undefined : value,
    });
  };

  const toggleShowCompleted = (checked: boolean) => {
    onChange({
      ...filters,
      showCompleted: checked,
      // Hiding completed conflicts with a "Done" status filter (would empty the
      // list). The checkbox wins: clear the Done filter when completed are hidden.
      status: !checked && filters.status === 'done' ? undefined : filters.status,
    });
  };

  const handleClearAll = () => {
    onChange({
      ...filters,
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
      showCompleted: true,
    });
  };

  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-foreground">Status:</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className={cn(
              "w-[140px]",
              filters.status && "ring-2 ring-primary/30 border-primary/50"
            )}>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
              <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
              <SelectItem value="blocked">{STATUS_LABELS.blocked}</SelectItem>
              <SelectItem value="review">{STATUS_LABELS.review}</SelectItem>
              <SelectItem value="done" disabled={!filters.showCompleted}>{STATUS_LABELS.done}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority filter */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-foreground">Priority:</Label>
          <Select
            value={filters.priority || 'all'}
            onValueChange={handlePriorityChange}
          >
            <SelectTrigger className={cn(
              "w-[120px]",
              filters.priority && "ring-2 ring-primary/30 border-primary/50"
            )}>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
              <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
              <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
              <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Assignee filter */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-foreground">Assignee:</Label>
          <Select
            value={filters.assigneeId || 'all'}
            onValueChange={handleAssigneeChange}
          >
            <SelectTrigger className={cn(
              "w-[160px]",
              filters.assigneeId && "ring-2 ring-primary/30 border-primary/50"
            )}>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="me">My Tasks</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Show completed checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-completed"
            checked={filters.showCompleted}
            onCheckedChange={toggleShowCompleted}
          />
          <Label
            htmlFor="show-completed"
            className="text-sm font-medium text-foreground cursor-pointer"
          >
            Show completed
          </Label>
        </div>

        {/* Clear all button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear filters ({activeFilterCount})
          </Button>
        )}
      </div>
    </div>
  );
}
