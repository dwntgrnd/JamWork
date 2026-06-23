import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import type { TaskFilterState } from '@/types';
import { cn } from '@/lib/utils';

/** The sortBy values that map to a list column header. */
export type SortableColumn = Extract<
  TaskFilterState['sortBy'],
  'title' | 'dueDate' | 'status' | 'priority' | 'effort'
>;

interface SortableTableHeadProps {
  label: string;
  column: SortableColumn;
  filters: TaskFilterState;
  onFiltersChange: (filters: TaskFilterState) => void;
  /** Where the 3rd click ("clear") returns to — the page's default order. */
  defaultSortBy: TaskFilterState['sortBy'];
  defaultSortDir: TaskFilterState['sortDir'];
  className?: string;
}

/**
 * A clickable column header that drives server-side sorting via a 3-state cycle:
 * unsorted → ascending → descending → clear (back to the page default order).
 * Exposes `aria-sort` on the cell and a keyboard-focusable button.
 */
export function SortableTableHead({
  label,
  column,
  filters,
  onFiltersChange,
  defaultSortBy,
  defaultSortDir,
  className,
}: SortableTableHeadProps) {
  const isActive = filters.sortBy === column;
  const ariaSort = isActive
    ? filters.sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  const handleClick = () => {
    if (!isActive) {
      onFiltersChange({ ...filters, sortBy: column, sortDir: 'asc' });
    } else if (filters.sortDir === 'asc') {
      onFiltersChange({ ...filters, sortBy: column, sortDir: 'desc' });
    } else {
      onFiltersChange({ ...filters, sortBy: defaultSortBy, sortDir: defaultSortDir });
    }
  };

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Sort by ${label}`}
        className={cn(
          'group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-foreground transition-colors',
          'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
          isActive ? 'font-semibold' : 'font-medium'
        )}
      >
        {label}
        {isActive ? (
          filters.sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown
            className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 motion-reduce:transition-none"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  );
}
