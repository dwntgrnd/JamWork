import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router';
import { apiGet, apiPut } from '@/lib/api';
import { Project, Task } from '@/types';
import { TaskList } from '@/components/task-list';
import { TaskFilters } from '@/components/task-filters';
import { TaskDrawer } from '@/components/task-drawer';
import { BulkActionBar } from '@/components/bulk-action-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, Loader2, Calendar } from 'lucide-react';
import { useFilterParams } from '@/hooks/use-filter-params';
import { ProjectPageSkeleton } from '@/components/project-page-skeleton';
import { ProjectNotFound } from '@/components/project-not-found';
import { toast } from 'sonner';

export default function ProjectPage() {
  const { id: projectId } = useParams();
  const [searchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);
  const [editingDates, setEditingDates] = useState(false);

  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'sortOrder', defaultSortDir: 'asc' });
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ projects: Project[] }>('/projects');
      const currentProject = data.projects.find((p) => p.id === projectId);
      if (currentProject) {
        setProject(currentProject);
        setProjectName(currentProject.name);
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProjectName = async () => {
    if (!projectName.trim() || !project) return;

    setSavingName(true);
    try {
      await apiPut(`/projects/${projectId}`, { name: projectName.trim() });
      setProject({ ...project, name: projectName.trim() });
      setEditingName(false);
      setSavedName(true);
      setTimeout(() => setSavedName(false), 2000);
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      console.error('Failed to save project name:', err);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveProjectDate = async (field: 'startDate' | 'endDate', value: string) => {
    if (!project) return;
    try {
      const dateValue = value || null;
      await apiPut(`/projects/${projectId}`, { [field]: dateValue });
      setProject({ ...project, [field]: dateValue });
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      console.error('Failed to save project date:', err);
      toast.error(err.message || 'Failed to save date');
    }
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    fetchProject();
  };

  const handleSelectionChange = (ids: Set<string>, tasks: Task[]) => {
    setSelectedTaskIds(ids);
    setSelectedTasks(tasks);
  };

  if (loading) return <ProjectPageSkeleton />;
  if (!project) return <ProjectNotFound />;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            {editingName ? (
              <div className="flex items-center gap-2 max-w-md">
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={handleSaveProjectName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveProjectName();
                    } else if (e.key === 'Escape') {
                      setProjectName(project.name);
                      setEditingName(false);
                    }
                  }}
                  autoFocus
                  className="text-3xl font-bold h-auto py-2"
                />
                {savingName && <Loader2 className="h-5 w-5 animate-spin" />}
                {savedName && <Check className="h-5 w-5 text-success" />}
              </div>
            ) : (
              <div>
                <h2
                  onClick={() => setEditingName(true)}
                  className="text-3xl font-bold text-foreground cursor-pointer hover:text-interactive"
                >
                  {project.name}
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-sm text-muted-foreground">
                    {project._count?.tasks || 0} tasks
                  </p>
                  {!editingDates && !project.startDate && !project.endDate ? (
                    <button
                      onClick={() => setEditingDates(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Calendar className="h-3 w-3" />
                      Add project dates
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                      </span>
                      <input
                        type="date"
                        className="text-xs bg-transparent border-b border-muted hover:border-foreground focus:border-interactive outline-none px-1 py-0.5 text-muted-foreground"
                        value={project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleSaveProjectDate('startDate', e.target.value)}
                        title="Project start date"
                      />
                      <span className="text-xs text-muted-foreground">—</span>
                      <input
                        type="date"
                        className="text-xs bg-transparent border-b border-muted hover:border-foreground focus:border-interactive outline-none px-1 py-0.5 text-muted-foreground"
                        value={project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleSaveProjectDate('endDate', e.target.value)}
                        min={project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : undefined}
                        title="Project end date"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Button variant="emphasis" className="rounded-lg px-5 gap-2 font-semibold" onClick={() => setShowTaskDrawer(true)}>
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>

        <div className="mb-6">
          <Tabs defaultValue="list" className="w-full">
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="board" asChild>
                <Link to={`/projects/${projectId}/board?${searchParams.toString()}`}>Board</Link>
              </TabsTrigger>
              <TabsTrigger value="timeline" asChild>
                <Link to={`/projects/${projectId}/timeline?${searchParams.toString()}`}>Timeline</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mb-6">
          {selectedTaskIds.size > 0 ? (
            <BulkActionBar
              selectedTaskIds={selectedTaskIds}
              tasks={selectedTasks}
              onActionComplete={() => {
                setSelectedTaskIds(new Set());
                setSelectedTasks([]);
                handleRefresh();
              }}
              onClearSelection={() => {
                setSelectedTaskIds(new Set());
                setSelectedTasks([]);
              }}
              projectId={projectId}
            />
          ) : (
            <TaskFilters filters={filters} onChange={setFilters} />
          )}
        </div>

        <TaskList
          projectId={projectId}
          filters={filters}
          refreshKey={refreshKey}
          onRefresh={handleRefresh}
          onSelectionChange={handleSelectionChange}
        />

        {showTaskDrawer && (
          <TaskDrawer
            mode="create"
            projectId={projectId}
            onSave={() => {
              handleRefresh();
              setShowTaskDrawer(false);
            }}
            onClose={() => setShowTaskDrawer(false)}
          />
        )}
      </div>
    </div>
  );
}
