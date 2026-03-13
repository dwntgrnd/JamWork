/**
 * Shared date utility functions for consistent date formatting and styling
 * across all task views (list, board, sprint backlog).
 */

/**
 * Formats a date string or Date object into a human-readable format.
 * @param dateStr - Date string or Date object
 * @returns Formatted date string (e.g., "Jan 15") or "—" if no date provided
 */
export function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Checks if a date is overdue (before today and task is not done).
 * @param dateStr - Date string or Date object
 * @param taskStatus - Task status (optional)
 * @returns true if date is overdue and task is not done
 */
export function isOverdue(dateStr?: string | Date, taskStatus?: string): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  const today = new Date();

  // Compare at midnight to avoid time-of-day issues
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  // Overdue only if date is before today AND task is not done
  return date < today && taskStatus !== 'done';
}

/**
 * Checks if a date is today.
 * @param dateStr - Date string or Date object
 * @returns true if date is today
 */
export function isToday(dateStr?: string | Date): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  const today = new Date();

  // Compare at midnight
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return date.getTime() === today.getTime();
}

/**
 * Checks if a date is tomorrow.
 * @param dateStr - Date string or Date object
 * @returns true if date is tomorrow
 */
export function isTomorrow(dateStr?: string | Date): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Compare at midnight (local timezone)
  date.setHours(0, 0, 0, 0);
  tomorrow.setHours(0, 0, 0, 0);

  return date.getTime() === tomorrow.getTime();
}

/**
 * Returns date urgency information with label, styling, and urgency flag.
 * Supports overdue, today, tomorrow, future, and no-date cases.
 * @param dateStr - Date string or Date object
 * @param taskStatus - Task status (optional)
 * @returns Object with label (display text), className (Tailwind classes), and isUrgent flag
 */
export function getDateUrgencyInfo(dateStr?: string | Date, taskStatus?: string): {
  label: string;
  className: string;
  isUrgent: boolean;
} {
  // No date case
  if (!dateStr) {
    return {
      label: '—',
      className: 'text-muted-foreground',
      isUrgent: false,
    };
  }

  // Done tasks never show urgency
  if (taskStatus === 'done') {
    return {
      label: formatDate(dateStr),
      className: 'text-muted-foreground',
      isUrgent: false,
    };
  }

  // Overdue case
  if (isOverdue(dateStr, taskStatus)) {
    return {
      label: `Overdue · ${formatDate(dateStr)}`,
      className: 'text-destructive font-semibold',
      isUrgent: true,
    };
  }

  // Today case
  if (isToday(dateStr)) {
    return {
      label: 'Today',
      className: 'text-warning font-medium',
      isUrgent: true,
    };
  }

  // Tomorrow case
  if (isTomorrow(dateStr)) {
    return {
      label: 'Tomorrow',
      className: 'text-warning font-medium',
      isUrgent: true,
    };
  }

  // Future case (default)
  return {
    label: formatDate(dateStr),
    className: 'text-muted-foreground',
    isUrgent: false,
  };
}