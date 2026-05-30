import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { apiGet } from '@/lib/api';
import { Project } from '@/types';
import { BoardView } from '@/components/board-view';
import { TaskFilters } from '@/components/task-filters';
import { ProjectHeader } from '@/components/project-header';
import { useFilterParams } from '@/hooks/use-filter-params';
import { ProjectPageSkeleton } from '@/components/project-page-skeleton';
import { ProjectNotFound } from '@/components/project-not-found';

export default function BoardPage() {
  const { id: projectId } = useParams();

  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'sortOrder', defaultSortDir: 'asc' });
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ProjectPageSkeleton />;
  if (!project) return <ProjectNotFound />;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <ProjectHeader
          project={project}
          activeView="board"
          onProjectUpdated={setProject}
          onTaskCreated={() => setRefreshKey((k) => k + 1)}
        />

        <div className="mb-6">
          <TaskFilters filters={filters} onChange={setFilters} hideProjectFilter />
        </div>

        <BoardView projectId={projectId!} filters={filters} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
