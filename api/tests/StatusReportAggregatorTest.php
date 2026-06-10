<?php

namespace Tests;

use JamWork\Services\ReportService;
use PHPUnit\Framework\TestCase;

/**
 * Phase 3a (CC30a): pure aggregator logic — grouping, report order, empty-group
 * omission, the Done 7-day window, overdue flagging, subtask counts, and the
 * milestone horizon filter. No DB: these operate on plain arrays so the
 * invariants are pinned independently of SQL.
 */
final class StatusReportAggregatorTest extends TestCase
{
    private const NOW = 1781434800; // 2026-06-09 12:00:00 UTC (fixed for determinism)

    /** @param array<int,array<string,mixed>> $tasks */
    private function groupsOf(array $tasks, int $windowDays = 7, array $subtasks = [], array $assignees = []): array
    {
        return ReportService::buildGroups($tasks, self::NOW, $windowDays, $subtasks, $assignees);
    }

    private function task(string $id, string $status, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'title' => "Task {$id}",
            'status' => $status,
            'due_date' => null,
            'completed_at' => null,
        ], $overrides);
    }

    private function daysFromNow(int $days): string
    {
        return date('Y-m-d H:i:s', self::NOW + $days * 86400);
    }

    public function testStatusLabelsMirrorClient(): void
    {
        $this->assertSame([
            'todo' => 'To Do',
            'in_progress' => 'In Progress',
            'blocked' => 'Blocked',
            'review' => 'Review',
            'done' => 'Done',
        ], ReportService::STATUS_LABELS);
    }

    public function testGroupsRenderInReportOrder(): void
    {
        // Deliberately out of order; expect Blocked -> In Progress -> Review -> To-Do -> Done.
        $groups = $this->groupsOf([
            $this->task('a', 'done', ['completed_at' => $this->daysFromNow(-1)]),
            $this->task('b', 'todo'),
            $this->task('c', 'blocked'),
            $this->task('d', 'review'),
            $this->task('e', 'in_progress'),
        ]);

        $this->assertSame(
            ['blocked', 'in_progress', 'review', 'todo', 'done'],
            array_column($groups, 'status')
        );
    }

    public function testEmptyStatusGroupsAreOmitted(): void
    {
        $groups = $this->groupsOf([
            $this->task('a', 'todo'),
            $this->task('b', 'todo'),
        ]);

        $this->assertCount(1, $groups);
        $this->assertSame('todo', $groups[0]['status']);
        $this->assertSame('To Do', $groups[0]['label']);
    }

    public function testDoneWindowExcludesOldCompletions(): void
    {
        $groups = $this->groupsOf([
            $this->task('recent', 'done', ['completed_at' => $this->daysFromNow(-3)]),
            $this->task('old', 'done', ['completed_at' => $this->daysFromNow(-30)]),
        ]);

        $this->assertCount(1, $groups, 'only the in-window done task makes a Done group');
        $this->assertSame('done', $groups[0]['status']);
        $this->assertSame(['recent'], array_column($groups[0]['tasks'], 'id'));
    }

    public function testDoneWithNullCompletedAtExcluded(): void
    {
        $groups = $this->groupsOf([
            $this->task('x', 'done', ['completed_at' => null]),
        ]);

        $this->assertSame([], $groups, 'a done task with NULL completed_at never appears');
    }

    public function testOverdueFlagging(): void
    {
        $groups = $this->groupsOf([
            $this->task('late', 'todo', ['due_date' => $this->daysFromNow(-2)]),
            $this->task('future', 'todo', ['due_date' => $this->daysFromNow(5)]),
            $this->task('nodue', 'in_progress'),
            $this->task('donelate', 'done', ['due_date' => $this->daysFromNow(-2), 'completed_at' => $this->daysFromNow(-1)]),
        ]);

        $byId = [];
        foreach ($groups as $g) {
            foreach ($g['tasks'] as $t) {
                $byId[$t['id']] = $t['overdue'];
            }
        }

        $this->assertTrue($byId['late'], 'non-done past-due is overdue');
        $this->assertFalse($byId['future'], 'future due is not overdue');
        $this->assertFalse($byId['nodue'], 'no due date is never overdue');
        $this->assertFalse($byId['donelate'], 'done is never overdue even if past-due');
    }

    public function testSubtaskCountsAndNoInflation(): void
    {
        $groups = $this->groupsOf(
            [
                $this->task('withsubs', 'todo'),
                $this->task('nosubs', 'todo'),
            ],
            7,
            ['withsubs' => ['completed' => 2, 'total' => 5]]
        );

        $tasks = $groups[0]['tasks'];
        $this->assertCount(2, $tasks, 'subtasks never add first-class tasks');
        $byId = array_column($tasks, null, 'id');
        $this->assertSame(['completed' => 2, 'total' => 5], $byId['withsubs']['subtasks']);
        $this->assertNull($byId['nosubs']['subtasks'], 'no subtasks -> null');
    }

    public function testMilestoneHorizonFilterAndSort(): void
    {
        $rows = [
            ['name' => 'Past', 'date' => $this->daysFromNow(-5)],
            ['name' => 'Soon', 'date' => $this->daysFromNow(30)],
            ['name' => 'Sooner', 'date' => $this->daysFromNow(10)],
            ['name' => 'Far', 'date' => $this->daysFromNow(100)],
        ];

        $milestones = ReportService::filterMilestones($rows, self::NOW, 90);

        $this->assertSame(['Sooner', 'Soon'], array_column($milestones, 'name'));
    }

    public function testBuildPayloadProjectsEmptyAndNoTasksStates(): void
    {
        // No included projects.
        $empty = ReportService::buildPayload([], [], self::NOW);
        $this->assertTrue($empty['projectsEmpty']);
        $this->assertSame([], $empty['projects']);

        // A project whose only task is an out-of-window done -> renders but hasTasks=false.
        $payload = ReportService::buildPayload(
            [[
                'id' => 'p1',
                'name' => 'Project One',
                'tasks' => [$this->task('old', 'done', ['completed_at' => $this->daysFromNow(-30)])],
                'subtaskCounts' => [],
                'assignees' => [],
            ]],
            [],
            self::NOW
        );

        $this->assertFalse($payload['projectsEmpty']);
        $this->assertCount(1, $payload['projects']);
        $this->assertFalse($payload['projects'][0]['hasTasks'], 'no renderable tasks -> hasTasks false');
        $this->assertSame([], $payload['projects'][0]['groups']);
    }
}
