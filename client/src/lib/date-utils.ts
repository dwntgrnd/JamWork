/**
 * Shared date utility functions for consistent date formatting and styling
 * across all task views (list, board, sprint backlog).
 */

/**
 * Parses a date value into a Date anchored in the local timezone.
 *
 * Date-only strings ("YYYY-MM-DD") are parsed by JS as UTC midnight, which can
 * render as the previous day in negative-offset timezones. This constructs them
 * from local Y/M/D components instead. Full ISO datetimes (which carry their own
 * timezone/offset) and existing Date objects are passed through unchanged.
 *
 * @param value - Date string or Date object
 * @returns Date in local time
 */
export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

/**
 * Returns local midnight (start of day) for the given value, or for now when omitted.
 * @param value - Date string or Date object (optional)
 * @returns Date at 00:00:00.000 local time
 */
export function startOfLocalDay(value?: string | Date): Date {
  const d = value !== undefined ? parseLocalDate(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
 * Whole days from today (local midnight) to the given date (local midnight).
 * Negative for past dates. Uses the timezone-safe local-day anchor.
 */
function daysUntil(dateStr: string | Date): number {
  const target = startOfLocalDay(dateStr).getTime();
  const today = startOfLocalDay().getTime();
  return Math.round((target - today) / 86_400_000);
}

/**
 * Checks if a date is 2–6 days from today (inclusive) — the "this week" tier.
 * @param dateStr - Date string or Date object
 * @returns true if the date is 2–6 days out
 */
export function isThisWeek(dateStr: string | Date): boolean {
  const d = daysUntil(dateStr);
  return d >= 2 && d <= 6;
}

/**
 * Checks if a date is 7–14 days from today (inclusive) — the "soon" tier.
 * @param dateStr - Date string or Date object
 * @returns true if the date is 7–14 days out
 */
export function isSoon(dateStr: string | Date): boolean {
  const d = daysUntil(dateStr);
  return d >= 7 && d <= 14;
}

/**
 * Returns date urgency information with label, styling, and urgency flag.
 * Graduated tiers: no-date, done, overdue, today, tomorrow, this-week (day
 * name), soon (foreground date), and distant (muted date).
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

  // This week (2–6 days out) — weekday name in the user's locale
  if (isThisWeek(dateStr)) {
    return {
      label: parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'long' }),
      className: 'text-foreground font-medium',
      isUrgent: false,
    };
  }

  // Soon (7–14 days out) — formatted date kept visually present
  if (isSoon(dateStr)) {
    return {
      label: formatDate(dateStr),
      className: 'text-foreground',
      isUrgent: false,
    };
  }

  // Distant (15+ days out) — muted formatted date
  return {
    label: formatDate(dateStr),
    className: 'text-muted-foreground',
    isUrgent: false,
  };
}