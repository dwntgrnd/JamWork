import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Plus, Loader2 } from 'lucide-react';
import { Project } from '@/types';

interface ProjectSelectorProps {
  projectId: string;
  projects: Project[];
  required: boolean;
  onValueChange: (value: string) => void;
  showNewProjectForm: boolean;
  newProjectName: string;
  onNewProjectNameChange: (v: string) => void;
  creatingProject: boolean;
  onCreateProject: () => void;
  onCancelNewProject: () => void;
}

/** Project field with inline "New Project" creation (task drawer). */
export function ProjectSelector({
  projectId,
  projects,
  required,
  onValueChange,
  showNewProjectForm,
  newProjectName,
  onNewProjectNameChange,
  creatingProject,
  onCreateProject,
  onCancelNewProject,
}: ProjectSelectorProps) {
  return (
    <div className="bg-field-bg rounded-md border border-field-border p-2">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
        Project {required && <span className="text-destructive">*</span>}
      </span>
      <Select value={projectId} onValueChange={onValueChange}>
        <SelectTrigger className="w-full h-8 text-sm font-medium border-0 shadow-none bg-transparent hover:bg-muted/50 mt-0.5">
          <SelectValue placeholder="Select project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
          <SelectItem value="__new__" className="text-interactive font-medium">
            <Plus className="h-3 w-3 inline mr-1" />
            New Project
          </SelectItem>
        </SelectContent>
      </Select>
      {showNewProjectForm && (
        <div className="flex items-center gap-2 mt-1">
          <Input
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => onNewProjectNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCreateProject();
              }
              if (e.key === 'Escape') {
                onCancelNewProject();
              }
            }}
            className="flex-1 h-8 text-sm"
            autoFocus
            disabled={creatingProject}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={onCreateProject}
            disabled={!newProjectName.trim() || creatingProject}
          >
            {creatingProject ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={onCancelNewProject}
            disabled={creatingProject}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
