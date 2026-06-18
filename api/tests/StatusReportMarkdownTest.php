<?php

namespace Tests;

use JamWork\Services\ReportMarkdownRenderer;
use JamWork\Services\ReportService;
use PHPUnit\Framework\TestCase;

/**
 * Phase 3b (CC30a): the Markdown renderer. Headings + lists, never tables
 * (Google Docs portability); overdue conveyed in text, not formatting; and
 * structural parity with the payload (same projects, groups, order, tasks).
 */
final class StatusReportMarkdownTest extends TestCase
{
    private const NOW = 1781434800; // 2026-06-09 12:00:00

    private function daysFromNow(int $days): string
    {
        return date('Y-m-d H:i:s', self::NOW + $days * 86400);
    }

    private function payload(array $projectsData, array $milestones = []): array
    {
        return ReportService::buildPayload($projectsData, $milestones, self::NOW);
    }

    private function project(string $name, array $tasks, array $subtasks = [], array $assignees = []): array
    {
        return [
            'id' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'tasks' => $tasks,
            'subtaskCounts' => $subtasks,
            'assignees' => $assignees,
        ];
    }

    private function task(string $id, string $status, array $overrides = []): array
    {
        return array_merge([
            'id' => $id, 'title' => "Task {$id}", 'status' => $status,
            'due_date' => null, 'completed_at' => null,
        ], $overrides);
    }

    public function testUsesHeadingsAndListsNotTables(): void
    {
        $md = ReportMarkdownRenderer::render($this->payload(
            [$this->project('Apollo', [$this->task('t1', 'blocked')])],
            [['name' => 'Launch', 'date' => $this->daysFromNow(20)]]
        ));

        $this->assertStringContainsString('# Status Report — ', $md);
        $this->assertStringContainsString('## Milestones (next 90 days)', $md);
        $this->assertStringContainsString('- Launch — ', $md);
        $this->assertStringContainsString('## Apollo', $md);
        $this->assertStringContainsString('### Blocked', $md);
        $this->assertStringContainsString('- Task t1', $md);
        $this->assertStringNotContainsString('|', $md, 'no Markdown tables (Google Docs portability)');
    }

    public function testOverdueConveyedInText(): void
    {
        $md = ReportMarkdownRenderer::render($this->payload(
            [$this->project('Apollo', [$this->task('late', 'todo', ['due_date' => $this->daysFromNow(-3)])])]
        ));

        $this->assertStringContainsString('OVERDUE', $md);
    }

    public function testRendersAssigneeDueAndSubtasks(): void
    {
        $md = ReportMarkdownRenderer::render($this->payload(
            [$this->project(
                'Apollo',
                [$this->task('t1', 'in_progress', ['due_date' => $this->daysFromNow(2)])],
                ['t1' => ['completed' => 2, 'total' => 5]],
                ['t1' => [['id' => 'u1', 'name' => 'Doren Berge']]]
            )]
        ));

        $this->assertStringContainsString('Doren Berge', $md);
        $this->assertStringContainsString('due ', $md);
        $this->assertStringContainsString('subtasks 2/5', $md);
    }

    public function testUnassignedTaskIsLabelled(): void
    {
        $md = ReportMarkdownRenderer::render($this->payload(
            [$this->project('Apollo', [$this->task('t1', 'todo')])]
        ));

        $this->assertStringContainsString('Unassigned', $md);
    }

    public function testEmptyStates(): void
    {
        // No included projects + no milestones.
        $md = ReportMarkdownRenderer::render($this->payload([], []));
        $this->assertStringContainsString('No milestones in the next 90 days.', $md);
        $this->assertStringContainsString('No projects are included in the status report.', $md);

        // A project with no renderable tasks.
        $md2 = ReportMarkdownRenderer::render($this->payload(
            [$this->project('Ghost', [$this->task('old', 'done', ['completed_at' => $this->daysFromNow(-30)])])]
        ));
        $this->assertStringContainsString('## Ghost', $md2);
        $this->assertStringContainsString('No active tasks.', $md2);
    }

    public function testRendererReadsCopyFromPayload(): void
    {
        // The renderer must render empty-state copy + the Unassigned label FROM the
        // payload, so markdown and the in-app view share one source and can't drift.
        $payload = $this->payload([], []);
        $payload['copy']['noProjects'] = 'CUSTOM NO PROJECTS';
        $payload['copy']['noMilestones'] = 'CUSTOM NO MILESTONES';
        $md = ReportMarkdownRenderer::render($payload);
        $this->assertStringContainsString('CUSTOM NO PROJECTS', $md);
        $this->assertStringContainsString('CUSTOM NO MILESTONES', $md);

        $payload2 = $this->payload(
            [$this->project('Ghost', [$this->task('old', 'done', ['completed_at' => $this->daysFromNow(-30)])])]
        );
        $payload2['copy']['noActiveTasks'] = 'CUSTOM NO TASKS';
        $this->assertStringContainsString('CUSTOM NO TASKS', ReportMarkdownRenderer::render($payload2));

        $payload3 = $this->payload([$this->project('Apollo', [$this->task('t1', 'todo')])]);
        $payload3['copy']['unassigned'] = 'CUSTOM UNASSIGNED';
        $this->assertStringContainsString('CUSTOM UNASSIGNED', ReportMarkdownRenderer::render($payload3));
    }

    public function testFilteredReportRendersScopeBlockquoteBetweenTitleAndMilestones(): void
    {
        $payload = $this->payload([$this->project('Apollo', [$this->task('t1', 'todo')])]);
        $payload['scope'] = [
            'isFiltered' => true,
            'includedProjectCount' => 1,
            'eligibleProjectCount' => 3,
            'note' => 'This report includes 1 of 3 eligible projects: Apollo.',
        ];

        $md = ReportMarkdownRenderer::render($payload);

        $this->assertStringContainsString('> This report includes 1 of 3 eligible projects: Apollo.', $md);
        $this->assertGreaterThan(
            strpos($md, '# Status Report'),
            strpos($md, '> This report includes'),
            'scope note renders below the title'
        );
        $this->assertLessThan(
            strpos($md, '## Milestones'),
            strpos($md, '> This report includes'),
            'scope note renders above the milestones block'
        );
    }

    public function testFullReportHasNoScopeBlockquote(): void
    {
        $md = ReportMarkdownRenderer::render(
            $this->payload([$this->project('Apollo', [$this->task('t1', 'todo')])])
        );

        $this->assertStringNotContainsString('This report includes', $md, 'a full report has no scope note');
    }

    public function testStructuralParityWithPayload(): void
    {
        $payload = $this->payload([
            $this->project('Apollo', [
                $this->task('blk', 'blocked'),
                $this->task('rev', 'review'),
            ]),
            $this->project('Gemini', [
                $this->task('td', 'todo'),
            ]),
        ]);
        $md = ReportMarkdownRenderer::render($payload);

        // Project headings appear in the same order as the payload.
        $projectHeads = [];
        foreach (explode("\n", $md) as $line) {
            if (str_starts_with($line, '## ') && $line !== '## Milestones (next 90 days)') {
                $projectHeads[] = substr($line, 3);
            }
        }
        $this->assertSame(['Apollo', 'Gemini'], $projectHeads);

        // Every group label and task title in the payload appears in the markdown.
        foreach ($payload['projects'] as $project) {
            foreach ($project['groups'] as $group) {
                $this->assertStringContainsString('### ' . $group['label'], $md);
                foreach ($group['tasks'] as $task) {
                    $this->assertStringContainsString($task['title'], $md);
                }
            }
        }

        // Apollo's groups render in report order: Blocked before Review.
        $this->assertLessThan(
            strpos($md, '### Review'),
            strpos($md, '### Blocked'),
            'groups render in report order'
        );
    }
}
