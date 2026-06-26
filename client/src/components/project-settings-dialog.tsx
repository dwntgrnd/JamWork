import { useEffect, useState } from 'react';
import { apiPut } from '@/lib/api';
import { invalidateProjects } from '@/hooks/use-projects';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (project: Project) => void;
}

function toDateInput(value?: Date | string): string {
  if (!value) return '';
  return new Date(value).toISOString().split('T')[0];
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onSaved,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [startDate, setStartDate] = useState(toDateInput(project.startDate));
  const [endDate, setEndDate] = useState(toDateInput(project.endDate));
  const [sprintPlanning, setSprintPlanning] = useState(project.sprintPlanning !== false);
  const [defaultNotifyEnabled, setDefaultNotifyEnabled] = useState(project.defaultNotifyEnabled !== false);
  const [includeInStatusReport, setIncludeInStatusReport] = useState(project.includeInStatusReport !== false);
  const [includeInMasterTimeline, setIncludeInMasterTimeline] = useState(project.includeInMasterTimeline !== false);
  const [saving, setSaving] = useState(false);

  // Re-sync form when a different project is opened or the dialog re-opens.
  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description ?? '');
      setStartDate(toDateInput(project.startDate));
      setEndDate(toDateInput(project.endDate));
      setSprintPlanning(project.sprintPlanning !== false);
      setDefaultNotifyEnabled(project.defaultNotifyEnabled !== false);
      setIncludeInStatusReport(project.includeInStatusReport !== false);
      setIncludeInMasterTimeline(project.includeInMasterTimeline !== false);
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setSaving(true);
    try {
      const { project: updated } = await apiPut<{ project: Project }>(
        `/projects/${project.id}`,
        {
          name: name.trim(),
          description: description.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          sprintPlanning,
          defaultNotifyEnabled,
          includeInStatusReport,
          includeInMasterTimeline,
        }
      );
      invalidateProjects();
      onSaved(updated);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save project settings:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save project settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Edit this project's details and how it participates in sprint planning.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="settings-project-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="settings-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="settings-project-description">Description</Label>
            <Textarea
              id="settings-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="settings-project-start-date">Start Date</Label>
              <Input
                id="settings-project-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="settings-project-end-date">End Date</Label>
              <Input
                id="settings-project-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="settings-sprint-planning">Part of sprint planning</Label>
              <p className="text-xs text-muted-foreground">
                When off, sprint bands are hidden on this project's timeline and its
                unscheduled tasks stay out of the sprint backlog.
              </p>
            </div>
            <Switch
              id="settings-sprint-planning"
              checked={sprintPlanning}
              onCheckedChange={setSprintPlanning}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="settings-default-notify">Default email notifications for new tasks</Label>
              <p className="text-xs text-muted-foreground">
                Seeds the "Email notifications for this task" flag when a task is created in
                this project. Changing it does not affect existing tasks.
              </p>
            </div>
            <Switch
              id="settings-default-notify"
              checked={defaultNotifyEnabled}
              onCheckedChange={setDefaultNotifyEnabled}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="settings-include-in-status-report">Include in status report</Label>
              <p className="text-xs text-muted-foreground">
                When off, this project and its tasks are excluded from generated status reports.
              </p>
            </div>
            <Switch
              id="settings-include-in-status-report"
              checked={includeInStatusReport}
              onCheckedChange={setIncludeInStatusReport}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="settings-include-in-master-timeline">Include in master timeline</Label>
              <p className="text-xs text-muted-foreground">
                When off, this project is hidden from the all-projects Timeline view. Its own
                Timeline tab is unaffected.
              </p>
            </div>
            <Switch
              id="settings-include-in-master-timeline"
              checked={includeInMasterTimeline}
              onCheckedChange={setIncludeInMasterTimeline}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
