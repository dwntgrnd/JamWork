import { Project } from '@/types';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ProjectPickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every workspace project — the picker is not subject to the sidebar filter. */
  projects: Project[];
  /** Currently curated project ids; drives the checkbox states. */
  pinnedProjects: string[];
  /**
   * Add/remove a single project from the curated list. Called on every checkbox
   * toggle so the sidebar updates live; the parent owns persistence.
   */
  onToggle: (projectId: string, checked: boolean) => void;
}

/**
 * Curated-project picker for the sidebar "Mine" view (CC37). Anchored to the
 * "Edit" link in the sidebar footer. Each checkbox toggle applies immediately
 * (the parent persists optimistically); "Done" just closes the popover.
 */
export function ProjectPickerPopover({
  open,
  onOpenChange,
  projects,
  pinnedProjects,
  onToggle,
}: ProjectPickerPopoverProps) {
  const pinned = new Set(pinnedProjects);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Edit
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <PopoverHeader className="mb-3">
          <PopoverTitle>My Projects</PopoverTitle>
        </PopoverHeader>

        <div className="max-h-64 space-y-2.5 overflow-y-auto">
          {projects.map((project) => {
            const inputId = `pin-project-${project.id}`;
            return (
              <div key={project.id} className="flex items-center gap-2.5">
                <Checkbox
                  id={inputId}
                  checked={pinned.has(project.id)}
                  onCheckedChange={(checked) => onToggle(project.id, checked === true)}
                />
                <Label htmlFor={inputId} className="cursor-pointer truncate font-normal text-foreground">
                  {project.name}
                </Label>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
