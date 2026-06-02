import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as FormLabel } from '@/components/ui/label';

export interface MilestoneForm {
  name: string;
  date: string;
}

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  form: MilestoneForm;
  onFormChange: (form: MilestoneForm) => void;
  error: string;
  onCancel: () => void;
  onSave: () => void;
  deleteOpen: boolean;
  onDeleteOpenChange: () => void;
  onConfirmDelete: () => void;
}

/** Create/edit milestone dialog plus the delete-confirmation alert. */
export function MilestoneDialog({
  open,
  onOpenChange,
  isEditing,
  form,
  onFormChange,
  error,
  onCancel,
  onSave,
  deleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
}: MilestoneDialogProps) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Milestone' : 'Create Milestone'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the milestone details.'
                : 'Add a new milestone to mark an important date on the timeline.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <FormLabel htmlFor="milestone-name">
                Name <span className="text-destructive">*</span>
              </FormLabel>
              <Input
                id="milestone-name"
                value={form.name}
                onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                placeholder="Milestone name"
                maxLength={100}
                autoFocus
              />
            </div>

            <div>
              <FormLabel htmlFor="milestone-date">
                Date <span className="text-destructive">*</span>
              </FormLabel>
              <Input
                id="milestone-date"
                type="date"
                value={form.date}
                onChange={(e) => onFormChange({ ...form, date: e.target.value })}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave}>
              {isEditing ? 'Save Changes' : 'Create Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this milestone. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
