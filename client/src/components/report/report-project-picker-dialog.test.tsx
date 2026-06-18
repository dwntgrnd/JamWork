import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportProjectPickerDialog } from '@/components/report/report-project-picker-dialog';
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

function renderPicker() {
  const onGenerate = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ReportProjectPickerDialog
      open
      onOpenChange={onOpenChange}
      projects={makeProjects()}
      onGenerate={onGenerate}
    />,
  );
  return { onGenerate, onOpenChange };
}

describe('ReportProjectPickerDialog', () => {
  afterEach(cleanup);

  it('opens with every project pre-checked and a full counter', () => {
    renderPicker();
    expect(screen.getByLabelText('Apollo')).toBeChecked();
    expect(screen.getByLabelText('Gemini')).toBeChecked();
    expect(screen.getByLabelText('Orion')).toBeChecked();
    expect(screen.getByText('3 of 3 projects selected')).toBeInTheDocument();
  });

  it('updates the counter as projects are unchecked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPicker();
    await user.click(screen.getByLabelText('Gemini'));
    expect(screen.getByLabelText('Gemini')).not.toBeChecked();
    expect(screen.getByText('2 of 3 projects selected')).toBeInTheDocument();
  });

  it('disables Generate Report when no projects are selected', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPicker();
    await user.click(screen.getByLabelText('Apollo'));
    await user.click(screen.getByLabelText('Gemini'));
    await user.click(screen.getByLabelText('Orion'));
    expect(screen.getByText('0 of 3 projects selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Report' })).toBeDisabled();
  });

  it('generates with only the selected project ids for a subset', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onGenerate, onOpenChange } = renderPicker();
    await user.click(screen.getByLabelText('Gemini')); // leaves Apollo + Orion
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    expect(onGenerate).toHaveBeenCalledWith(['p1', 'p3']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('generates a full report (null) when all projects remain selected', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onGenerate } = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    expect(onGenerate).toHaveBeenCalledWith(null);
  });

  it('closes without generating when Cancel is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onGenerate, onOpenChange } = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('resets to all-checked when reopened after a change', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const projects = makeProjects();
    const { rerender } = render(
      <ReportProjectPickerDialog open onOpenChange={() => {}} projects={projects} onGenerate={() => {}} />,
    );
    await user.click(screen.getByLabelText('Gemini'));
    expect(screen.getByLabelText('Gemini')).not.toBeChecked();

    rerender(<ReportProjectPickerDialog open={false} onOpenChange={() => {}} projects={projects} onGenerate={() => {}} />);
    rerender(<ReportProjectPickerDialog open onOpenChange={() => {}} projects={projects} onGenerate={() => {}} />);
    expect(screen.getByLabelText('Gemini')).toBeChecked();
  });
});
