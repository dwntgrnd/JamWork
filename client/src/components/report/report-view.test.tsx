import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { ReportView } from '@/components/report/report-view'
import type { ReportPayload } from '@/types/report'

const copy = {
  noProjects: 'No projects are included in status reports.',
  noActiveTasks: 'No active tasks.',
  noMilestones: 'No milestones in the next 90 days.',
  unassigned: 'Unassigned',
}

function payload(over: Partial<ReportPayload> = {}): ReportPayload {
  return {
    generatedAt: '2026-06-10T12:00:00+00:00',
    windowDays: 14,
    milestoneHorizonDays: 90,
    milestones: [{ name: 'Launch', date: '2026-07-15T00:00:00+00:00' }],
    projects: [
      {
        id: 'p1',
        name: 'Alpha',
        hasTasks: true,
        groups: [
          {
            status: 'blocked',
            label: 'Blocked',
            tasks: [
              {
                id: 't1',
                title: 'Wire the thing',
                assignees: [{ id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Bo' }],
                dueDate: '2026-06-01T00:00:00+00:00',
                overdue: true,
                subtasks: { completed: 3, total: 5 },
              },
            ],
          },
        ],
      },
    ],
    projectsEmpty: false,
    copy,
    ...over,
  }
}

afterEach(cleanup)

describe('ReportView — milestone block', () => {
  it('renders the milestone heading with the horizon and lists milestones', () => {
    render(<ReportView payload={payload()} />)
    expect(screen.getByRole('heading', { name: /Milestones \(next 90 days\)/ })).toBeInTheDocument()
    expect(screen.getByText('Launch')).toBeInTheDocument()
  })

  it('renders copy.noMilestones when the milestones array is empty', () => {
    render(<ReportView payload={payload({ milestones: [] })} />)
    expect(screen.getByText(copy.noMilestones)).toBeInTheDocument()
  })
})

describe('ReportView — empty states from payload.copy', () => {
  it('renders copy.noProjects and no project sections when projectsEmpty', () => {
    render(<ReportView payload={payload({ projects: [], projectsEmpty: true })} />)
    expect(screen.getByText(copy.noProjects)).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('renders copy.noActiveTasks for a project with hasTasks: false', () => {
    render(
      <ReportView
        payload={payload({
          projects: [{ id: 'p1', name: 'Alpha', hasTasks: false, groups: [] }],
        })}
      />,
    )
    expect(screen.getByText(copy.noActiveTasks)).toBeInTheDocument()
  })

  it('renders copy.unassigned when a task has zero assignees', () => {
    render(
      <ReportView
        payload={payload({
          projects: [
            {
              id: 'p1',
              name: 'Alpha',
              hasTasks: true,
              groups: [
                {
                  status: 'todo',
                  label: 'To Do',
                  tasks: [
                    { id: 't1', title: 'Lonely task', assignees: [], dueDate: null, overdue: false, subtasks: null },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    )
    expect(screen.getByText(copy.unassigned)).toBeInTheDocument()
  })
})

describe('ReportView — task rendering invariants', () => {
  it('uses group.label, not the client STATUS_LABELS map', () => {
    render(
      <ReportView
        payload={payload({
          projects: [
            {
              id: 'p1',
              name: 'Alpha',
              hasTasks: true,
              groups: [
                {
                  status: 'blocked', // STATUS_LABELS.blocked === "Blocked"
                  label: 'CUSTOM-LABEL',
                  tasks: [{ id: 't1', title: 'x', assignees: [], dueDate: null, overdue: false, subtasks: null }],
                },
              ],
            },
          ],
        })}
      />,
    )
    expect(screen.getByRole('heading', { name: 'CUSTOM-LABEL' })).toBeInTheDocument()
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument()
  })

  it('renders the overdue flag as text (not color-only)', () => {
    render(<ReportView payload={payload()} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('renders subtask progress as N/M when present, absent when null', () => {
    const { rerender } = render(<ReportView payload={payload()} />)
    expect(screen.getByText('3/5')).toBeInTheDocument()

    rerender(
      <ReportView
        payload={payload({
          projects: [
            {
              id: 'p1',
              name: 'Alpha',
              hasTasks: true,
              groups: [
                {
                  status: 'blocked',
                  label: 'Blocked',
                  tasks: [{ id: 't1', title: 'x', assignees: [{ id: 'u1', name: 'Ada' }], dueDate: null, overdue: false, subtasks: null }],
                },
              ],
            },
          ],
        })}
      />,
    )
    expect(screen.queryByText('3/5')).not.toBeInTheDocument()
  })

  it('comma-joins assignee names', () => {
    render(<ReportView payload={payload()} />)
    expect(screen.getByText('Ada, Bo')).toBeInTheDocument()
  })
})

describe('ReportView — blind ordering', () => {
  it('renders projects, groups, and tasks in payload order without re-sorting', () => {
    const p = payload({
      projects: [
        {
          id: 'pz', name: 'Zeta', hasTasks: true,
          groups: [
            { status: 'blocked', label: 'Blocked', tasks: [
              { id: 'tb', title: 'Beta task', assignees: [], dueDate: null, overdue: false, subtasks: null },
              { id: 'ta', title: 'Alpha task', assignees: [], dueDate: null, overdue: false, subtasks: null },
            ] },
            { status: 'todo', label: 'To Do', tasks: [
              { id: 'tt', title: 'Todo task', assignees: [], dueDate: null, overdue: false, subtasks: null },
            ] },
          ],
        },
        {
          id: 'pa', name: 'Aardvark', hasTasks: true,
          groups: [
            { status: 'review', label: 'Review', tasks: [
              { id: 'tr', title: 'Review task', assignees: [], dueDate: null, overdue: false, subtasks: null },
            ] },
          ],
        },
      ],
    })
    render(<ReportView payload={p} />)

    // Project order: Zeta before Aardvark (payload order, not alphabetical).
    const projectHeadings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(projectHeadings).toEqual(['Milestones (next 90 days)', 'Zeta', 'Aardvark'])

    // Group order within Zeta: Blocked before To Do.
    const groupHeadings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(groupHeadings).toEqual(['Blocked', 'To Do', 'Review'])

    // Task order within the Blocked group: Beta task before Alpha task.
    const blocked = screen.getByRole('heading', { name: 'Blocked' }).closest('section') as HTMLElement
    const tasks = within(blocked).getAllByRole('listitem').map((li) => li.textContent)
    expect(tasks[0]).toContain('Beta task')
    expect(tasks[1]).toContain('Alpha task')
  })
})
