import { useState } from 'react';
import { Project } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ReportProjectPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Report-eligible projects to choose from (already filtered to includeInStatusReport). */
  projects: Project[];
  /**
   * Generate with the chosen scope. `null` = every project is selected → a full
   * report (no projectIds sent, no "Filtered" metadata); otherwise the selected
   * subset's ids, in the order the projects were given.
   */
  onGenerate: (projectIds: string[] | null) => void;
}

/**
 * Project picker for scoping an ad hoc status report (CC36). All projects are
 * pre-checked each time it opens — the dialog never remembers a prior selection,
 * so every ad hoc generation starts from the full set.
 */
export function ReportProjectPickerDialog({
  open,
  onOpenChange,
  projects,
  onGenerate,
}: ReportProjectPickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(projects.map((p) => p.id)));
  const [wasOpen, setWasOpen] = useState(open);

  // Reset to all-checked each time the dialog transitions open — the picker never
  // remembers a prior selection, so every ad hoc generation starts fresh. This is
  // a render-phase reset (the React-recommended way to adjust state on a prop
  // change), which avoids a setState-in-effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected(new Set(projects.map((p) => p.id)));
    }
  }

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedCount = selected.size;
  const total = projects.length;
  const allSelected = selectedCount === total;

  const handleGenerate = () => {
    onOpenChange(false);
    // All selected → a full report (null); otherwise the selected subset, in order.
    onGenerate(allSelected ? null : projects.filter((p) => selected.has(p.id)).map((p) => p.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Projects for Report</DialogTitle>
          <DialogDescription>
            The report will cover only the projects you select below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {projects.map((project) => {
            const inputId = `report-project-${project.id}`;
            return (
              <div key={project.id} className="flex items-center gap-2.5">
                <Checkbox
                  id={inputId}
                  checked={selected.has(project.id)}
                  onCheckedChange={(checked) => toggle(project.id, checked === true)}
                />
                <Label htmlFor={inputId} className="cursor-pointer font-normal text-foreground">
                  {project.name}
                </Label>
              </div>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selectedCount} of {total} projects selected
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={selectedCount === 0}>
            Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
