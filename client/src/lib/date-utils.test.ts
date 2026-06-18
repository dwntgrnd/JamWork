import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDateUrgencyInfo,
  isThisWeek,
  isSoon,
  formatDate,
} from '@/lib/date-utils';

// Anchor "today" to a fixed local date so every relative date below is
// deterministic regardless of the machine's timezone. Dates are passed as
// Date objects (not "YYYY-MM-DD" strings) to avoid UTC-parsing drift.
const TODAY = new Date(2026, 5, 17, 9, 0, 0); // Jun 17, 2026, 09:00 local

function daysFromToday(n: number): Date {
  const d = new Date(TODAY);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getDateUrgencyInfo — urgency tiers', () => {
  it('returns an em dash and muted when no date is given', () => {
    const info = getDateUrgencyInfo(undefined);
    expect(info).toEqual({
      label: '—',
      className: 'text-muted-foreground',
      isUrgent: false,
    });
  });

  it('shows a muted formatted date for a done task regardless of proximity', () => {
    const overdueButDone = daysFromToday(-3);
    const info = getDateUrgencyInfo(overdueButDone, 'done');
    expect(info.label).toBe(formatDate(overdueButDone));
    expect(info.className).toBe('text-muted-foreground');
    expect(info.isUrgent).toBe(false);
  });

  it('marks a past date on a non-done task as overdue (destructive, semibold)', () => {
    const past = daysFromToday(-2);
    const info = getDateUrgencyInfo(past, 'todo');
    expect(info.label).toBe(`Overdue · ${formatDate(past)}`);
    expect(info.className).toBe('text-urgency-overdue font-semibold');
    expect(info.isUrgent).toBe(true);
  });

  it('shows "Today" with warning styling (not a day name)', () => {
    const info = getDateUrgencyInfo(daysFromToday(0), 'todo');
    expect(info.label).toBe('Today');
    expect(info.className).toBe('text-urgency-warning font-medium');
    expect(info.isUrgent).toBe(true);
  });

  it('shows "Tomorrow" with warning styling (not a day name)', () => {
    const info = getDateUrgencyInfo(daysFromToday(1), 'todo');
    expect(info.label).toBe('Tomorrow');
    expect(info.className).toBe('text-urgency-warning font-medium');
    expect(info.isUrgent).toBe(true);
  });

  it('shows the weekday name for 2 days out (this-week start boundary)', () => {
    const d = daysFromToday(2);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(d.toLocaleDateString(undefined, { weekday: 'long' }));
    expect(info.className).toBe('text-foreground font-medium');
    expect(info.isUrgent).toBe(false);
  });

  it('shows the weekday name for 6 days out (this-week end boundary)', () => {
    const d = daysFromToday(6);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(d.toLocaleDateString(undefined, { weekday: 'long' }));
    expect(info.className).toBe('text-foreground font-medium');
  });

  it('shows a foreground formatted date at 7 days out (soon start boundary)', () => {
    const d = daysFromToday(7);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(formatDate(d));
    expect(info.className).toBe('text-foreground');
    expect(info.isUrgent).toBe(false);
  });

  it('shows a foreground formatted date at 14 days out (soon end boundary)', () => {
    const d = daysFromToday(14);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(formatDate(d));
    expect(info.className).toBe('text-foreground');
  });

  it('shows a muted formatted date at 15 days out (distant start boundary)', () => {
    const d = daysFromToday(15);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(formatDate(d));
    expect(info.className).toBe('text-muted-foreground');
    expect(info.isUrgent).toBe(false);
  });

  it('shows a muted formatted date far in the future', () => {
    const d = daysFromToday(120);
    const info = getDateUrgencyInfo(d, 'todo');
    expect(info.label).toBe(formatDate(d));
    expect(info.className).toBe('text-muted-foreground');
  });

  it('keeps the { label, className, isUrgent } return shape', () => {
    const info = getDateUrgencyInfo(daysFromToday(3), 'todo');
    expect(Object.keys(info).sort()).toEqual(['className', 'isUrgent', 'label']);
  });
});

describe('isThisWeek — 2 to 6 days from today inclusive', () => {
  it('is false for today, tomorrow, and 7+ days', () => {
    expect(isThisWeek(daysFromToday(0))).toBe(false);
    expect(isThisWeek(daysFromToday(1))).toBe(false);
    expect(isThisWeek(daysFromToday(7))).toBe(false);
  });

  it('is true for the 2–6 day range inclusive', () => {
    expect(isThisWeek(daysFromToday(2))).toBe(true);
    expect(isThisWeek(daysFromToday(4))).toBe(true);
    expect(isThisWeek(daysFromToday(6))).toBe(true);
  });

  it('is false for past dates', () => {
    expect(isThisWeek(daysFromToday(-1))).toBe(false);
  });
});

describe('isSoon — 7 to 14 days from today inclusive', () => {
  it('is false for 6 days and 15 days', () => {
    expect(isSoon(daysFromToday(6))).toBe(false);
    expect(isSoon(daysFromToday(15))).toBe(false);
  });

  it('is true for the 7–14 day range inclusive', () => {
    expect(isSoon(daysFromToday(7))).toBe(true);
    expect(isSoon(daysFromToday(10))).toBe(true);
    expect(isSoon(daysFromToday(14))).toBe(true);
  });
});
