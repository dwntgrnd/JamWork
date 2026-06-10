<?php

namespace Tests;

use JamWork\Services\ReportEmailRenderer;
use JamWork\Services\ReportService;
use PHPUnit\Framework\TestCase;

/**
 * The HTML email renderer (CC32a). Tests content correctness, not pixel layout:
 * the email is a pure projection of the payload (project names, task titles,
 * status labels, milestones, assignees/due/overdue/subtasks) plus the email
 * chrome (workspace name, CTA link, footer). Inline-styles-only is asserted
 * structurally (no <style> block, no external stylesheet).
 */
final class StatusReportEmailRendererTest extends TestCase
{
    private const NOW = 1781434800; // 2026-06-09 12:00:00
    private const WS = 'Acme Team';
    private const URL = 'https://app.example.com/reports/abc-123';

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

    private function render(array $projectsData, array $milestones = []): string
    {
        return ReportEmailRenderer::render($this->payload($projectsData, $milestones), self::WS, self::URL);
    }

    // --- Chrome -------------------------------------------------------------

    public function testIncludesHeaderWorkspaceCtaAndFooter(): void
    {
        $html = $this->render([$this->project('Apollo', [$this->task('t1', 'blocked')])]);

        $this->assertStringContainsString('Status Report — ' . self::WS, $html);
        $this->assertStringContainsString('Generated ', $html);
        $this->assertStringContainsString(self::URL, $html);
        $this->assertStringContainsString('View this report in JamWork', $html);
        $this->assertStringContainsString('To change your report preferences, ask your workspace admin.', $html);
    }

    public function testUsesInlineStylesOnly(): void
    {
        $html = $this->render([$this->project('Apollo', [$this->task('t1', 'todo')])]);

        $this->assertStringNotContainsString('<style', $html, 'no <style> blocks (clients strip them)');
        $this->assertStringNotContainsString('<link', $html, 'no external stylesheets');
        $this->assertStringContainsString('style="', $html);
    }

    // --- Content projection -------------------------------------------------

    public function testRendersProjectsGroupsAndTasks(): void
    {
        $html = $this->render([
            $this->project('Apollo', [
                $this->task('t1', 'blocked', ['title' => 'Fix the launch']),
                $this->task('t2', 'in_progress', ['title' => 'Wire the booster']),
            ]),
        ]);

        $this->assertStringContainsString('Apollo', $html);
        $this->assertStringContainsString('Fix the launch', $html);
        $this->assertStringContainsString('Wire the booster', $html);
        // Status labels sourced from group.label (Decision #94).
        $this->assertStringContainsString('Blocked', $html);
        $this->assertStringContainsString('In Progress', $html);
    }

    public function testRendersMilestones(): void
    {
        $html = $this->render(
            [$this->project('Apollo', [$this->task('t1', 'todo')])],
            [['name' => 'Public Launch', 'date' => $this->daysFromNow(20)]]
        );

        $this->assertStringContainsString('Milestones', $html);
        $this->assertStringContainsString('Public Launch', $html);
    }

    public function testRendersAssigneesDueOverdueAndSubtasks(): void
    {
        $html = $this->render(
            [$this->project(
                'Apollo',
                [$this->task('late', 'todo', ['title' => 'Late task', 'due_date' => $this->daysFromNow(-3)])],
                ['late' => ['completed' => 1, 'total' => 3]],
                ['late' => [['id' => 'u1', 'name' => 'Ada Lovelace']]]
            )]
        );

        $this->assertStringContainsString('Ada Lovelace', $html);
        $this->assertStringContainsString('Overdue', $html);
        $this->assertStringContainsString('due ', $html);
        $this->assertStringContainsString('subtasks 1/3', $html);
    }

    public function testUnassignedTaskShowsUnassignedLabel(): void
    {
        $html = $this->render([$this->project('Apollo', [$this->task('t1', 'todo')])]);
        $this->assertStringContainsString('Unassigned', $html);
    }

    public function testEmptyProjectsRendersNoProjectsCopy(): void
    {
        $html = ReportEmailRenderer::render($this->payload([]), self::WS, self::URL);
        $this->assertStringContainsString('No projects are included in the status report.', $html);
    }

    // --- Escaping -----------------------------------------------------------

    public function testEscapesInterpolatedValues(): void
    {
        $html = ReportEmailRenderer::render(
            $this->payload([$this->project('A & B <x>', [$this->task('t1', 'todo', ['title' => '<script>evil()</script>'])])]),
            'Team <b>X</b>',
            self::URL
        );

        $this->assertStringNotContainsString('<script>evil()', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringContainsString('A &amp; B', $html);
        $this->assertStringContainsString('Team &lt;b&gt;X', $html);
    }

    // --- Plain-text AltBody -------------------------------------------------

    public function testTextBodyMirrorsContentWithoutHtml(): void
    {
        $payload = $this->payload(
            [$this->project('Apollo', [$this->task('t1', 'blocked', ['title' => 'Fix launch'])])],
            [['name' => 'Public Launch', 'date' => $this->daysFromNow(20)]]
        );
        $text = ReportEmailRenderer::renderText($payload, self::WS, self::URL);

        $this->assertStringContainsString('Status Report — ' . self::WS, $text);
        $this->assertStringContainsString('Public Launch', $text);
        $this->assertStringContainsString('Apollo', $text);
        $this->assertStringContainsString('Fix launch', $text);
        $this->assertStringContainsString('Blocked', $text);
        $this->assertStringContainsString('To change your report preferences', $text);
        $this->assertStringNotContainsString('<', $text, 'AltBody is plain text');
    }
}
