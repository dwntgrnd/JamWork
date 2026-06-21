import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Sidebar } from '@/components/sidebar';
import { useProjects } from '@/hooks/use-projects';
import { useSidebarPreferences, useUpdateSidebarPreferences } from '@/hooks/use-preferences';
import type { Project } from '@/types';
import type { SidebarPreferences } from '@/types/preferences';

vi.mock('@/hooks/use-projects', () => ({
  useProjects: vi.fn(),
  invalidateProjects: vi.fn(),
}));
vi.mock('@/hooks/use-preferences', () => ({
  useSidebarPreferences: vi.fn(),
  useUpdateSidebarPreferences: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  getErrorMessage: (e: unknown) => String(e),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const mockedUseProjects = vi.mocked(useProjects);
const mockedUsePrefs = vi.mocked(useSidebarPreferences);
const mockedUseUpdate = vi.mocked(useUpdateSidebarPreferences);

function makeProjects(): Project[] {
  const base = { createdById: 'u1', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' };
  return [
    { ...base, id: 'p1', name: 'Apollo' },
    { ...base, id: 'p2', name: 'Gemini' },
    { ...base, id: 'p3', name: 'Orion' },
  ];
}

function setPrefs(prefs: SidebarPreferences | undefined) {
  mockedUsePrefs.mockReturnValue({ data: prefs } as unknown as ReturnType<typeof useSidebarPreferences>);
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/my-tasks']}>
      <Sidebar collapsed={false} onToggle={() => {}} />
    </MemoryRouter>,
  );
}

describe('Sidebar — All/Mine project filtering', () => {
  let mutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutate = vi.fn();
    mockedUseProjects.mockReturnValue({
      data: makeProjects(),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjects>);
    mockedUseUpdate.mockReturnValue({ mutate } as unknown as ReturnType<typeof useUpdateSidebarPreferences>);
    setPrefs({ view: 'all', pinnedProjects: [] });
  });
  afterEach(cleanup);

  it('renders every project in the default All view', () => {
    renderSidebar();
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('Orion')).toBeInTheDocument();
  });

  it('filters to the curated set in Mine view', () => {
    setPrefs({ view: 'mine', pinnedProjects: ['p1'] });
    renderSidebar();
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    expect(screen.queryByText('Gemini')).not.toBeInTheDocument();
    expect(screen.queryByText('Orion')).not.toBeInTheDocument();
  });

  it('shows the empty state in Mine view with no curated projects', () => {
    setPrefs({ view: 'mine', pinnedProjects: [] });
    renderSidebar();
    expect(screen.getByText(/No projects selected/)).toBeInTheDocument();
    expect(screen.queryByText('Apollo')).not.toBeInTheDocument();
  });

  it('silently ignores stale pinned ids (deleted projects)', () => {
    setPrefs({ view: 'mine', pinnedProjects: ['p1', 'does-not-exist'] });
    renderSidebar();
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    expect(screen.queryByText('Gemini')).not.toBeInTheDocument();
  });

  it('persists the new view when the toggle is switched to Mine', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSidebar();
    await user.click(screen.getByRole('switch'));
    expect(mutate).toHaveBeenCalledWith({ view: 'mine', pinnedProjects: [] });
  });

  it('opens the project picker from the footer Edit link in Mine view', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setPrefs({ view: 'mine', pinnedProjects: ['p1'] });
    renderSidebar();
    expect(screen.queryByText('My Projects')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('My Projects')).toBeInTheDocument();
  });

  it('opens the picker from the empty-state Edit link', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setPrefs({ view: 'mine', pinnedProjects: [] });
    renderSidebar();
    // Two "Edit" affordances in this state (empty-state message + footer); the
    // first in DOM order is the empty-state link.
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByText('My Projects')).toBeInTheDocument();
  });

  it('hides the All/Mine footer when the sidebar is collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/my-tasks']}>
        <Sidebar collapsed onToggle={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
