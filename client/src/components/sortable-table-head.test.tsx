import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortableTableHead } from '@/components/sortable-table-head';
import type { TaskFilterState } from '@/types';

afterEach(cleanup);

const baseFilters: TaskFilterState = {
  showCompleted: true,
  sortBy: 'sortOrder',
  sortDir: 'asc',
};

function renderHead(filters: Partial<TaskFilterState>, onChange = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <SortableTableHead
            label="Priority"
            column="priority"
            filters={{ ...baseFilters, ...filters }}
            onFiltersChange={onChange}
            defaultSortBy="sortOrder"
            defaultSortDir="asc"
          />
        </tr>
      </thead>
    </table>
  );
  return { onChange };
}

describe('SortableTableHead', () => {
  it('renders the label and is unsorted (aria-sort none) when another column is active', () => {
    renderHead({ sortBy: 'dueDate', sortDir: 'asc' });
    const cell = screen.getByRole('columnheader');
    expect(cell).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('button', { name: /sort by priority/i })).toBeInTheDocument();
  });

  it('first click on an inactive column sorts it ascending', async () => {
    const { onChange } = renderHead({ sortBy: 'dueDate', sortDir: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'priority', sortDir: 'asc' })
    );
  });

  it('reflects ascending state and toggles to descending on click', async () => {
    const { onChange } = renderHead({ sortBy: 'priority', sortDir: 'asc' });
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'priority', sortDir: 'desc' })
    );
  });

  it('third click (active + descending) clears back to the page default order', async () => {
    const { onChange } = renderHead({ sortBy: 'priority', sortDir: 'desc' });
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'sortOrder', sortDir: 'asc' })
    );
  });
});
