import { TimelineView } from '@/components/timeline-view';
import { TaskFilters } from '@/components/task-filters';
import { useFilterParams } from '@/hooks/use-filter-params';

export default function GlobalTimelinePage() {
  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'dueDate', defaultSortDir: 'asc' });

  return (
    <div className="p-8">
      <div>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">Timeline</h2>
          <p className="text-sm text-muted-foreground mt-1">Tasks across all projects</p>
        </div>

        <div className="mb-6">
          <TaskFilters filters={filters} onChange={setFilters} />
        </div>

        <TimelineView filters={filters} />
      </div>
    </div>
  );
}
