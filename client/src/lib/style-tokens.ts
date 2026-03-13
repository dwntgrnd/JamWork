/**
 * Centralized design tokens for status and priority styling.
 * All view components import from here to ensure consistency.
 * Uses CSS custom properties — no dark: variants needed.
 */

import { TaskStatus, TaskPriority, TaskEffort } from '@/types';

/**
 * Status chip color tokens (bold fill, rounded rectangle).
 * Uses CSS variable-based Tailwind classes that adapt to light/dark automatically.
 */
export const STATUS_COLORS: Record<
  TaskStatus,
  { bg: string; text: string }
> = {
  todo: {
    bg: 'bg-status-todo-bg',
    text: 'text-status-todo-fg',
  },
  in_progress: {
    bg: 'bg-status-in_progress-bg',
    text: 'text-status-in_progress-fg',
  },
  review: {
    bg: 'bg-status-review-bg',
    text: 'text-status-review-fg',
  },
  done: {
    bg: 'bg-status-done-bg',
    text: 'text-status-done-fg',
  },
};

/**
 * Priority dot color tokens.
 * Returns Tailwind background classes for priority dots.
 */
export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-priority-urgent',
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

/**
 * Priority pill color tokens (tinted bg + colored text).
 */
export const PRIORITY_PILL_COLORS: Record<TaskPriority, { bg: string; text: string }> = {
  urgent: { bg: 'bg-priority-urgent-bg', text: 'text-priority-urgent-fg' },
  high: { bg: 'bg-priority-high-bg', text: 'text-priority-high-fg' },
  medium: { bg: 'bg-priority-medium-bg', text: 'text-priority-medium-fg' },
  low: { bg: 'bg-priority-low-bg', text: 'text-priority-low-fg' },
};

/**
 * Returns Tailwind classes for a status chip (bold fill, rounded rectangle).
 * @param status - Task status
 * @returns Complete Tailwind class string for chip styling
 */
export function getStatusChipClasses(status: TaskStatus): string {
  const colors = STATUS_COLORS[status];
  return `${colors.bg} ${colors.text} text-xs font-medium px-2 py-0.5 rounded-md`;
}

/**
 * Returns Tailwind classes for a status pill badge (filled, fully rounded).
 * Used in sprint views, backlog rows, and anywhere a compact status indicator is needed.
 * @param status - Task status
 * @returns Complete Tailwind class string for pill styling
 */
export function getStatusPillClasses(status: TaskStatus): string {
  const colors = STATUS_COLORS[status];
  return `${colors.bg} ${colors.text} text-[11px] font-medium px-2.5 py-0.5 rounded-full leading-none whitespace-nowrap capitalize`;
}

/**
 * Formats a task status string for display (e.g., "in_progress" -> "In Progress").
 */
export function formatStatusLabel(status: TaskStatus): string {
  return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns Tailwind classes for a priority dot.
 * @param priority - Task priority
 * @returns Tailwind background classes for the dot
 */
export function getPriorityDotColor(priority: TaskPriority): string {
  return PRIORITY_COLORS[priority];
}

/**
 * Returns Tailwind classes for a priority pill (tinted bg + colored text).
 * @param priority - Task priority
 * @returns Complete Tailwind class string for pill styling
 */
export function getPriorityPillClasses(priority: TaskPriority): string {
  const colors = PRIORITY_PILL_COLORS[priority];
  return `${colors.bg} ${colors.text} text-xs font-medium px-2 py-0.5 rounded-md`;
}

/**
 * Effort badge color tokens (subtle informational colors).
 */
export const EFFORT_COLORS: Record<number, string> = {
  1: 'bg-effort-1-bg text-effort-1-fg',
  2: 'bg-effort-2-bg text-effort-2-fg',
  4: 'bg-effort-4-bg text-effort-4-fg',
  8: 'bg-effort-8-bg text-effort-8-fg',
};

/**
 * Returns Tailwind classes for an effort badge.
 * @param effort - Effort value (1, 2, 4, or 8)
 * @returns Complete Tailwind class string for badge styling
 */
export function getEffortBadgeClasses(effort: number): string {
  const colors = EFFORT_COLORS[effort] || EFFORT_COLORS[1];
  return `${colors} text-xs font-semibold px-2.5 py-1 rounded-full leading-none`;
}

/**
 * Avatar background color tokens (CSS-variable-based, no dark: variants).
 */
export const AVATAR_COLORS = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
];

/**
 * Returns a deterministic avatar background class for a given user ID.
 * @param userId - User or assignee ID string
 * @returns Tailwind background class from AVATAR_COLORS
 */
export function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
