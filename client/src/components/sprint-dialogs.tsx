import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getStatusPillClasses, formatStatusLabel, getPriorityDotColor } from '@/lib/style-tokens';
import { Sprint, Task } from '@/types';

type SprintWithTasks = Sprint & {
  tasks?: (Task & { project?: { id: string; name: string } })[];
};

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  error: string;
  onCancel: () => void;
  onCreate: () => void;
}

export function CreateSprintDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  error,
  onCancel,
  onCreate,
}: CreateSprintDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Sprint</DialogTitle>
          <DialogDescription>Create a new sprint to organize tasks</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-sprint-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-sprint-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Sprint name"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-sprint-desc">Description</Label>
            <Textarea
              id="new-sprint-desc"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Sprint goals or context (optional)"
              maxLength={500}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-start-date">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-start-date"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-end-date">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onCreate}>Create Sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  error: string;
  onCancel: () => void;
  onSave: () => void;
}

export function EditSprintDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  error,
  onCancel,
  onSave,
}: EditSprintDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Sprint</DialogTitle>
          <DialogDescription>Update sprint details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-sprint-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Sprint name"
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-desc">Description</Label>
            <Textarea
              id="edit-sprint-desc"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Sprint goals or context (optional)"
              maxLength={500}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start-date">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-start-date"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end-date">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>Update Sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CloseSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closingSprint: SprintWithTasks | null;
  otherActive: SprintWithTasks[];
  closeAction: 'backlog' | 'next_sprint';
  onCloseActionChange: (v: 'backlog' | 'next_sprint') => void;
  closeNextSprintId: string;
  onCloseNextSprintIdChange: (v: string) => void;
  error: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CloseSprintDialog({
  open,
  onOpenChange,
  closingSprint,
  otherActive,
  closeAction,
  onCloseActionChange,
  closeNextSprintId,
  onCloseNextSprintIdChange,
  error,
  loading,
  onCancel,
  onConfirm,
}: CloseSprintDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close sprint</DialogTitle>
          <DialogDescription>
            {closingSprint &&
              (() => {
                const incompleteTasks = (closingSprint.tasks || []).filter((t) => t.status !== 'done');
                if (incompleteTasks.length === 0) {
                  return `All tasks are complete. Close this sprint?`;
                }
                return `${closingSprint.name} has ${incompleteTasks.length} incomplete task${incompleteTasks.length === 1 ? '' : 's'}. Choose where to move them.`;
              })()}
          </DialogDescription>
        </DialogHeader>

        {closingSprint &&
          (() => {
            const allTasks = closingSprint.tasks || [];
            const incompleteTasks = allTasks.filter((t) => t.status !== 'done');
            const completedCount = allTasks.filter((t) => t.status === 'done').length;
            const selectedSprintName = otherActive.find((s) => s.id === closeNextSprintId)?.name;

            if (incompleteTasks.length === 0) {
              return (
                <p className="text-sm text-muted-foreground">
                  All {allTasks.length} task{allTasks.length === 1 ? '' : 's'} in this sprint are marked as done.
                </p>
              );
            }

            return (
              <div className="space-y-4">
                {/* Incomplete task list */}
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {incompleteTasks.map((task, idx) => (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm',
                        idx < incompleteTasks.length - 1 && 'border-b'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getPriorityDotColor(task.priority))} />
                      <span className="flex-1 truncate text-foreground">{task.title}</span>
                      <span className={cn(getStatusPillClasses(task.status), 'flex-shrink-0')}>
                        {formatStatusLabel(task.status)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Radio group */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Move incomplete tasks to:</Label>
                  <RadioGroup value={closeAction} onValueChange={(v) => onCloseActionChange(v as 'backlog' | 'next_sprint')}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="backlog" id="close-backlog" />
                      <Label htmlFor="close-backlog" className="cursor-pointer">
                        <span className="text-sm font-medium">Backlog</span>
                        <span className="text-xs text-muted-foreground ml-2">Remove sprint assignment</span>
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="next_sprint" id="close-next-sprint" disabled={otherActive.length === 0} />
                        <Label htmlFor="close-next-sprint" className={cn('cursor-pointer', otherActive.length === 0 && 'opacity-50')}>
                          <span className="text-sm font-medium">Move to sprint</span>
                          {otherActive.length === 0 && (
                            <span className="text-xs text-muted-foreground ml-2">No other active sprints</span>
                          )}
                        </Label>
                      </div>
                      {closeAction === 'next_sprint' && otherActive.length > 0 && (
                        <div className="ml-6">
                          <Select value={closeNextSprintId || undefined} onValueChange={onCloseNextSprintIdChange}>
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue placeholder="Select a sprint..." />
                            </SelectTrigger>
                            <SelectContent>
                              {otherActive.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </RadioGroup>
                </div>

                {/* Summary */}
                <div className="bg-muted rounded-md p-3">
                  <p className="text-sm text-muted-foreground">
                    {completedCount} completed task{completedCount === 1 ? '' : 's'} will stay in this sprint's history. {incompleteTasks.length} incomplete task{incompleteTasks.length === 1 ? '' : 's'} will be moved to {closeAction === 'backlog' ? 'backlog' : (selectedSprintName || 'the selected sprint')}.
                  </p>
                </div>
              </div>
            );
          })()}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Closing...' : 'Close sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
