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
  onValueChange: (value: string) => void;
  showNewProjectForm: boolean;
  newProjectName: string;
  onNewProjectNameChange: (v: string) => void;
  creatingProject: boolean;
  onCreateProject: () => void;
  onCancelNewProject: () => void;
}

/** Project value control with inline "New Project" creation (label supplied by the row). */
export function ProjectSelector({
  projectId,
  projects,
  onValueChange,
  showNewProjectForm,
  newProjectName,
  onNewProjectNameChange,
  creatingProject,
  onCreateProject,
  onCancelNewProject,
}: ProjectSelectorProps) {
  return (
    <div>
      <Select value={projectId} onValueChange={onValueChange}>
        <SelectTrigger aria-labelledby="task-project-label" className="w-fit border-0 bg-transparent px-2 text-sm font-medium shadow-none hover:bg-muted/50">
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
