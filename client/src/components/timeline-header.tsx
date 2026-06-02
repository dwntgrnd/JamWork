import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Target, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type ZoomLevel = 'day' | 'week' | 'month';

interface TimelineHeaderProps {
  zoomLevel: ZoomLevel;
  onZoomChange: (level: ZoomLevel) => void;
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
  onToday: () => void;
  onCreateMilestone: () => void;
}

/** Timeline toolbar: zoom controls, date navigation, add-milestone, status legend. */
export function TimelineHeader({
  zoomLevel,
  onZoomChange,
  onNavigateLeft,
  onNavigateRight,
  onToday,
  onCreateMilestone,
}: TimelineHeaderProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-card border rounded-lg">
      {/* Time-scale controls */}
      <div className="flex items-center rounded-md border bg-muted p-0.5">
        {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => onZoomChange(level)}
            className={cn(
              'px-3 py-1 text-sm font-medium rounded-sm transition-colors',
              zoomLevel === level
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {level === 'day' ? 'Day' : level === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onNavigateLeft}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          <Target className="h-4 w-4 mr-1" />
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={onNavigateRight}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Add Milestone button */}
      <Button variant="outline" size="sm" onClick={onCreateMilestone}>
        <Plus className="h-4 w-4 mr-1" />
        Milestone
      </Button>

      {/* Status legend */}
      <div className="flex items-center gap-3 ml-auto">
        {[
          { label: 'To Do', color: 'bg-status-todo-bg' },
          { label: 'In Progress', color: 'bg-status-in_progress-bg' },
          { label: 'Review', color: 'bg-status-review-bg' },
          { label: 'Done', color: 'bg-status-done-bg' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className={cn('w-3 h-2 rounded-sm', item.color)} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
