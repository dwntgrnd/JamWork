import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TaskDrawer } from '@/components/task-drawer';
import { apiGet, apiPut } from '@/lib/api';
import type { Task } from '@/types';

// Capture the Sheet's onOpenChange so we can simulate a dismiss (outside-click /
// Esc) WITHOUT moving focus — which is exactly the bug condition: Radix fires
// onOpenChange on close, but the focused textarea never blurs, so the blur-save
// never runs.
let sheetOnOpenChange: ((open: boolean) => void) | undefined;
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, onOpenChange }: { children?: ReactNode; onOpenChange?: (open: boolean) => void }) => {
    sheetOnOpenChange = onOpenChange;
    return <div>{children}</div>;
  },
  SheetContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

// Stub heavy / Radix-driven children so the test stays focused on the
// description flow and free of jsdom popover flakiness.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));
vi.mock('@/components/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock('@/components/due-date-picker', () => ({ DueDatePicker: () => <div /> }));
vi.mock('@/components/assignee-selector', () => ({ AssigneeSelector: () => <div /> }));
vi.mock('@/components/subtask-list', () => ({ SubtaskList: () => <div /> }));
vi.mock('@/components/task-links-section', () => ({ TaskLinksSection: () => <div /> }));
vi.mock('@/components/project-selector', () => ({ ProjectSelector: () => <div /> }));
vi.mock('@/components/save-status-indicator', () => ({ SaveStatusIndicator: () => <div /> }));
vi.mock('@/components/task-drawer-dialogs', () => ({
  DeleteConfirmDialog: () => null,
  UnsavedChangesDialog: () => null,
}));

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock('@/hooks/use-projects', () => ({ invalidateProjects: vi.fn() }));

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockApiPut = apiPut as ReturnType<typeof vi.fn>;

const task = {
  id: 't1',
  title: 'My task',
  description: 'Old description',
  status: 'todo',
  priority: 'medium',
  projectId: 'p1',
  assignees: [],
  subtasks: [],
  links: [],
} as unknown as Task;

beforeEach(() => {
  sheetOnOpenChange = undefined;
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/projects') return Promise.resolve({ projects: [] });
    if (url === '/auth/users') return Promise.resolve({ users: [] });
    if (url === '/sprints') return Promise.resolve({ sprints: [] });
    return Promise.resolve({});
  });
  mockApiPut.mockResolvedValue({});
});
afterEach(cleanup);

describe('TaskDrawer — autosave on dismiss', () => {
  it('flushes a pending description edit when the drawer is dismissed', async () => {
    const user = userEvent.setup();
    render(<TaskDrawer mode="edit" task={task} onSave={vi.fn()} onClose={vi.fn()} />);

    // Read -> write, then change the description (no blur).
    await user.click(screen.getByText('Old description'));
    const textarea = screen.getByPlaceholderText('What needs to be done?');
    await user.clear(textarea);
    await user.type(textarea, 'New description');

    // Dismiss the way Radix does on outside-click/Esc: fire onOpenChange without
    // blurring the textarea.
    await act(async () => {
      sheetOnOpenChange?.(false);
    });

    expect(mockApiPut).toHaveBeenCalledWith('/tasks/t1', { description: 'New description' });
  });
});
