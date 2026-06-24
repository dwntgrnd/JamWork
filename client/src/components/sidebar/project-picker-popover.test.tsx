import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectPickerPopover } from '@/components/sidebar/project-picker-popover';
import type { Project } from '@/types';

beforeAll(() => {
  // Radix primitives need these in jsdom.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function makeProjects(): Project[] {
  const base = { createdById: 'u1', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' };
  return [
    { ...base, id: 'p1', name: 'Apollo' },
    { ...base, id: 'p2', name: 'Gemini' },
    { ...base, id: 'p3', name: 'Orion' },
  ];
}

function renderPicker(pinnedProjects: string[] = ['p1', 'p3']) {
  const onToggle = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ProjectPickerPopover
      open
      onOpenChange={onOpenChange}
      projects={makeProjects()}
      pinnedProjects={pinnedProjects}
      onToggle={onToggle}
    />,
  );
  return { onToggle, onOpenChange };
}

describe('ProjectPickerPopover', () => {
  afterEach(cleanup);

  it('shows every workspace project with check state from pinnedProjects', () => {
    renderPicker(['p1', 'p3']);
    expect(screen.getByText('Pinned Projects')).toBeInTheDocument();
    expect(screen.getByLabelText('Apollo')).toBeChecked();
    expect(screen.getByLabelText('Gemini')).not.toBeChecked();
    expect(screen.getByLabelText('Orion')).toBeChecked();
  });

  it('toggles a project on when an unchecked box is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onToggle } = renderPicker(['p1']);
    await user.click(screen.getByLabelText('Gemini'));
    expect(onToggle).toHaveBeenCalledWith('p2', true);
  });

  it('toggles a project off when a checked box is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onToggle } = renderPicker(['p1', 'p2']);
    await user.click(screen.getByLabelText('Apollo'));
    expect(onToggle).toHaveBeenCalledWith('p1', false);
  });

  it('closes via the Done button without any extra side effects', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onToggle, onOpenChange } = renderPicker(['p1']);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders an empty (all-unchecked) state when nothing is pinned', () => {
    renderPicker([]);
    expect(screen.getByLabelText('Apollo')).not.toBeChecked();
    expect(screen.getByLabelText('Gemini')).not.toBeChecked();
    expect(screen.getByLabelText('Orion')).not.toBeChecked();
  });
});
