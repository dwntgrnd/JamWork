import { useState } from 'react';
import { useParams } from 'react-router';
import { Task } from '@/types';
import { TaskList } from '@/components/task-list';
import { TaskFilters } from '@/components/task-filters';
import { BulkActionBar } from '@/components/bulk-action-bar';
import { ProjectHeader } from '@/components/project-header';
import { useFilterParams } from '@/hooks/use-filter-params';
import { useProject } from '@/hooks/use-project';
import { ProjectPageSkeleton } from '@/components/project-page-skeleton';
import { ProjectNotFound } from '@/components/project-not-found';

export default function ProjectPage() {
  const { id: projectId } = useParams();

  const { project, loading, setProject, refetch } = useProject(projectId);

  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'sortOrder', defaultSortDir: 'asc' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    refetch();
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
        <ProjectHeader
          project={project}
          activeView="list"
          onProjectUpdated={setProject}
          onTaskCreated={handleRefresh}
        />

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
      </div>
    </div>
  );
}
