import { TaskStatus } from '@/types';
import { STATUS_COLORS } from '@/lib/style-tokens';
import { cn } from '@/lib/utils';
import type { ReportPayload, ReportGroup, ReportTask } from '@/types/report';

/** Format an ISO date for display (e.g. "Jul 15, 2026"). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A subtle status-colored dot. Visual cue only — the text label always renders. */
function StatusDot({ status }: { status: string }) {
  const bg = STATUS_COLORS[status as TaskStatus]?.bg ?? 'bg-muted';
  return <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', bg)} aria-hidden="true" />;
}

function TaskLine({ task, unassigned }: { task: ReportTask; unassigned: string }) {
  const assignees = task.assignees.length > 0 ? task.assignees.map((a) => a.name).join(', ') : unassigned;
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-sm">
      <span className="font-medium text-foreground">{task.title}</span>
      <span className="text-muted-foreground">{assignees}</span>
      {task.dueDate && <span className="text-muted-foreground">Due {formatDate(task.dueDate)}</span>}
      {task.overdue && (
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
          Overdue
        </span>
      )}
      {task.subtasks && (
        <span className="text-xs text-muted-foreground">
          {task.subtasks.completed}/{task.subtasks.total}
        </span>
      )}
    </li>
  );
}

function StatusGroup({ group, unassigned }: { group: ReportGroup; unassigned: string }) {
  return (
    <section className="mt-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <StatusDot status={group.status} />
        {group.label}
      </h3>
      <ul className="mt-1 pl-4">
        {group.tasks.map((task) => (
          <TaskLine key={task.id} task={task} unassigned={unassigned} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Blind renderer of a stored report payload. Walks projects, groups, and tasks
 * in the exact order given — never re-sorts, re-filters, re-groups, or
 * re-computes. Empty-state copy and status labels come straight from the
 * payload (`copy.*`, `group.label`); none is defined client-side here.
 */
export function ReportView({ payload }: { payload: ReportPayload }) {
  const { copy } = payload;
  return (
    <div className="space-y-8">
      {/* Milestone block — always present, rendered once for the whole report. */}
      <section>
        <h2 className="text-xl font-bold text-foreground">
          Milestones (next {payload.milestoneHorizonDays} days)
        </h2>
        {payload.milestones.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{copy.noMilestones}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {payload.milestones.map((m) => (
              <li key={`${m.name}-${m.date}`} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-foreground">{m.name}</span>
                <span className="text-muted-foreground">{formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {payload.projectsEmpty ? (
        <p className="text-sm text-muted-foreground">{copy.noProjects}</p>
      ) : (
        payload.projects.map((project, index) => (
          <section
            key={project.id}
            className={index > 0 ? "border-t border-border pt-8" : undefined}
          >
            <h2 className="text-xl font-bold text-foreground">{project.name}</h2>
            {!project.hasTasks ? (
              <p className="mt-1 text-sm text-muted-foreground">{copy.noActiveTasks}</p>
            ) : (
              project.groups.map((group) => (
                <StatusGroup key={group.status} group={group} unassigned={copy.unassigned} />
              ))
            )}
          </section>
        ))
      )}
    </div>
  );
}
