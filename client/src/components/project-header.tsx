import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, Calendar, Settings } from 'lucide-react';
import { ProjectSettingsDialog } from '@/components/project-settings-dialog';
import { TaskDrawer } from '@/components/task-drawer';

type ProjectView = 'list' | 'board' | 'timeline';

function formatProjectDate(value?: Date | string): string {
  if (!value) return '…';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ProjectHeaderProps {
  project: Project;
  activeView: ProjectView;
  /** Called with the updated project after settings are saved. */
  onProjectUpdated: (project: Project) => void;
  /** Called after a task is created from the New Task button. */
  onTaskCreated: () => void;
}

export function ProjectHeader({
  project,
  activeView,
  onProjectUpdated,
  onTaskCreated,
}: ProjectHeaderProps) {
  const [searchParams] = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);

  const query = searchParams.toString();
  const withQuery = (path: string) => (query ? `${path}?${query}` : path);

  const renderTab = (value: ProjectView, label: string, path: string) =>
    activeView === value ? (
      <TabsTrigger value={value}>{label}</TabsTrigger>
    ) : (
      <TabsTrigger value={value} asChild>
        <Link to={withQuery(path)}>{label}</Link>
      </TabsTrigger>
    );

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <h2 className="text-3xl font-bold text-foreground">{project.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              {project._count?.tasks || 0} open
            </p>
            {(project.startDate || project.endDate) && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatProjectDate(project.startDate)} — {formatProjectDate(project.endDate)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(true)}
                  aria-label="Project settings"
                >
                  <Settings className="size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Project settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="emphasis"
            className="rounded-lg px-5 gap-2 font-semibold"
            onClick={() => setShowTaskDrawer(true)}
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <Tabs value={activeView} className="w-full">
          <TabsList>
            {renderTab('list', 'List', `/projects/${project.id}`)}
            {renderTab('board', 'Board', `/projects/${project.id}/board`)}
            {renderTab('timeline', 'Timeline', `/projects/${project.id}/timeline`)}
          </TabsList>
        </Tabs>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={showSettings}
        onOpenChange={setShowSettings}
        onSaved={onProjectUpdated}
      />

      {showTaskDrawer && (
        <TaskDrawer
          mode="create"
          projectId={project.id}
          onSave={() => {
            onTaskCreated();
            setShowTaskDrawer(false);
          }}
          onClose={() => setShowTaskDrawer(false)}
        />
      )}
    </>
  );
}
