<?php

namespace Tests\Integration;

/**
 * Phase 1 (CC30a): verifies migration 006_status_report.sql produced the
 * expected schema — the `reports` table, the `projects.include_in_status_report`
 * flag (default ON), and the nullable `tasks.completed_at` column. The harness
 * replays every migrations/*.sql against the test DB, so these assert the real
 * migrated MySQL schema.
 */
final class StatusReportSchemaTest extends IntegrationTestCase
{
    /** @return string[] column names present on $table in the test DB */
    private function columnsOf(string $table): array
    {
        $stmt = $this->db->prepare(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t'
        );
        $stmt->execute(['t' => $table]);
        return $stmt->fetchAll(\PDO::FETCH_COLUMN);
    }

    public function testReportsTableExistsWithExpectedColumns(): void
    {
        $columns = $this->columnsOf('reports');

        $this->assertNotEmpty($columns, 'reports table should exist');
        foreach (
            ['id', 'generated_at', 'type', 'triggered_by', 'window_days', 'payload_json', 'markdown']
            as $expected
        ) {
            $this->assertContains($expected, $columns, "reports should have `{$expected}` column");
        }
    }

    public function testNewProjectDefaultsToIncludedInStatusReport(): void
    {
        $this->assertContains(
            'include_in_status_report',
            $this->columnsOf('projects'),
            'projects should have `include_in_status_report`'
        );

        // Behavioral: a project seeded without the flag inherits DEFAULT 1.
        $user = $this->seedUser();
        $projectId = $this->seedProject($user['id']);

        $value = $this->db->query(
            "SELECT include_in_status_report FROM projects WHERE id = '{$projectId}'"
        )->fetchColumn();

        $this->assertSame(1, (int) $value, 'new projects default to included');
    }

    public function testNewTaskHasNullCompletedAt(): void
    {
        $this->assertContains(
            'completed_at',
            $this->columnsOf('tasks'),
            'tasks should have `completed_at`'
        );

        // Behavioral: a freshly seeded (todo) task has no completion timestamp.
        $user = $this->seedUser();
        $projectId = $this->seedProject($user['id']);
        $taskId = $this->seedTask($projectId, $user['id']);

        $value = $this->db->query(
            "SELECT completed_at FROM tasks WHERE id = '{$taskId}'"
        )->fetchColumn();

        $this->assertNull($value, 'a new non-done task has NULL completed_at');
    }
}
