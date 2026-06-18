<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Phase 3c (CC30a): the /reports endpoints + aggregator, end-to-end against real
 * MySQL. Covers the round-trip, inclusion flag, soft-delete exclusion, the global
 * milestone read, the Done window, archive ordering, payload<->markdown parity,
 * auth gating, and the no-mutation regression.
 */
final class ReportRoutesTest extends IntegrationTestCase
{
    private array $user;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->seedUser(['display_name' => 'Doren Berge']);
        $this->token = $this->tokenFor($this->user);
    }

    private function seedMilestone(string $name, string $date, ?string $projectId = null): void
    {
        $this->db->prepare(
            'INSERT INTO milestones (id, name, date, project_id, created_by_id)
             VALUES (:id, :name, :date, :project_id, :created_by_id)'
        )->execute([
            'id' => Uuid::uuid4()->toString(),
            'name' => $name,
            'date' => $date,
            'project_id' => $projectId,
            'created_by_id' => $this->user['id'],
        ]);
    }

    private function excludeProject(string $projectId): void
    {
        $this->db->prepare('UPDATE projects SET include_in_status_report = 0 WHERE id = :id')
            ->execute(['id' => $projectId]);
    }

    private function seedSubtask(string $taskId, bool $completed): void
    {
        $this->db->prepare(
            'INSERT INTO subtasks (id, title, completed, sort_order, task_id)
             VALUES (:id, :title, :completed, 0, :task_id)'
        )->execute([
            'id' => Uuid::uuid4()->toString(),
            'title' => 'sub',
            'completed' => $completed ? 1 : 0,
            'task_id' => $taskId,
        ]);
    }

    private function daysAgo(int $days): string
    {
        return date('Y-m-d H:i:s', time() - $days * 86400);
    }

    private function daysAhead(int $days): string
    {
        return date('Y-m-d H:i:s', time() + $days * 86400);
    }

    /** Recursively collect every task title present in a payload. */
    private function payloadTaskTitles(array $payload): array
    {
        $titles = [];
        foreach ($payload['projects'] as $project) {
            foreach ($project['groups'] as $group) {
                foreach ($group['tasks'] as $task) {
                    $titles[] = $task['title'];
                }
            }
        }
        return $titles;
    }

    // --- Generation round-trip -------------------------------------------

    public function testGenerateStoresAndReturnsReport(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Live task', 'status' => 'blocked']);

        $res = $this->request('POST', '/reports', null, $this->token);

        $this->assertSame(201, $res->getStatusCode());
        $report = $this->decode($res)['report'];
        $this->assertTrue(Uuid::isValid($report['id']));
        $this->assertSame('ad_hoc', $report['type']);
        $this->assertSame(
            ['id' => $this->user['id'], 'displayName' => 'Doren Berge'],
            $report['triggeredBy'],
            'triggeredBy carries the byline name'
        );
        $this->assertSame(7, $report['windowDays']);
        $this->assertContains('Live task', $this->payloadTaskTitles($report['payload']));

        $count = (int) $this->db->query('SELECT COUNT(*) FROM reports')->fetchColumn();
        $this->assertSame(1, $count, 'the report is persisted');
    }

    public function testGenerationMutatesNoSourceRecords(): void
    {
        $projectId = $this->seedProject($this->user['id']);
        $taskId = $this->seedTask($projectId, $this->user['id'], ['status' => 'in_progress']);
        $this->seedMilestone('Launch', $this->daysAhead(20));

        $before = $this->db->query(
            "SELECT
               (SELECT COUNT(*) FROM tasks) AS tc,
               (SELECT COUNT(*) FROM projects) AS pc,
               (SELECT COUNT(*) FROM milestones) AS mc,
               (SELECT updated_at FROM tasks WHERE id = '{$taskId}') AS task_updated"
        )->fetch();

        $this->request('POST', '/reports', null, $this->token);

        $after = $this->db->query(
            "SELECT
               (SELECT COUNT(*) FROM tasks) AS tc,
               (SELECT COUNT(*) FROM projects) AS pc,
               (SELECT COUNT(*) FROM milestones) AS mc,
               (SELECT updated_at FROM tasks WHERE id = '{$taskId}') AS task_updated"
        )->fetch();

        $this->assertSame($before['tc'], $after['tc']);
        $this->assertSame($before['pc'], $after['pc']);
        $this->assertSame($before['mc'], $after['mc']);
        $this->assertSame($before['task_updated'], $after['task_updated'], 'task not touched by generation');
    }

    // --- Inclusion flag ---------------------------------------------------

    public function testInclusionFlagIsHonoredAtGenerationTime(): void
    {
        $included = $this->seedProject($this->user['id'], ['name' => 'Included']);
        $excluded = $this->seedProject($this->user['id'], ['name' => 'Excluded']);
        $this->seedTask($included, $this->user['id'], ['title' => 'Shown']);
        $this->seedTask($excluded, $this->user['id'], ['title' => 'Hidden']);
        $this->excludeProject($excluded);

        $res = $this->request('POST', '/reports', null, $this->token);
        $names = array_column($this->decode($res)['report']['payload']['projects'], 'name');
        $this->assertSame(['Included'], $names, 'excluded project absent');

        // Toggle back on -> reappears on regeneration.
        $this->db->prepare('UPDATE projects SET include_in_status_report = 1 WHERE id = :id')
            ->execute(['id' => $excluded]);
        $res2 = $this->request('POST', '/reports', null, $this->token);
        $names2 = array_column($this->decode($res2)['report']['payload']['projects'], 'name');
        $this->assertContains('Excluded', $names2);
    }

    // --- Per-task report inclusion (CC34) ---------------------------------

    public function testTaskExcludedFromReportWhenIncludeInReportIsZero(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Shown', 'status' => 'todo']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Hidden', 'status' => 'todo', 'include_in_report' => 0]);

        $res = $this->request('POST', '/reports', null, $this->token);
        $titles = $this->payloadTaskTitles($this->decode($res)['report']['payload']);

        $this->assertContains('Shown', $titles, 'include_in_report = 1 still appears');
        $this->assertNotContains('Hidden', $titles, 'include_in_report = 0 is filtered out');
    }

    // --- Soft delete ------------------------------------------------------

    public function testSoftDeletedTaskNeverAppears(): void
    {
        $projectId = $this->seedProject($this->user['id']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Alive', 'status' => 'todo']);
        // A recently-done task that is also soft-deleted must not surface.
        $this->seedTask($projectId, $this->user['id'], [
            'title' => 'Deleted',
            'status' => 'done',
            'completed_at' => $this->daysAgo(1),
            'deleted_at' => $this->daysAgo(1),
        ]);

        $res = $this->request('POST', '/reports', null, $this->token);
        $titles = $this->payloadTaskTitles($this->decode($res)['report']['payload']);

        $this->assertContains('Alive', $titles);
        $this->assertNotContains('Deleted', $titles);
    }

    // --- Done window end-to-end ------------------------------------------

    public function testDoneWindowExcludesOldCompletionsEndToEnd(): void
    {
        $projectId = $this->seedProject($this->user['id']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Recently done', 'status' => 'done', 'completed_at' => $this->daysAgo(2)]);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Long done', 'status' => 'done', 'completed_at' => $this->daysAgo(30)]);

        $res = $this->request('POST', '/reports', null, $this->token);
        $titles = $this->payloadTaskTitles($this->decode($res)['report']['payload']);

        $this->assertContains('Recently done', $titles);
        $this->assertNotContains('Long done', $titles);
    }

    // --- Milestones: global, no project scoping --------------------------

    public function testMilestonesAreReadGloballyRegardlessOfProject(): void
    {
        $projectId = $this->seedProject($this->user['id']);
        $this->seedMilestone('Global milestone', $this->daysAhead(15), null);
        $this->seedMilestone('Project milestone', $this->daysAhead(25), $projectId);
        $this->seedMilestone('Too far', $this->daysAhead(200), null);

        $res = $this->request('POST', '/reports', null, $this->token);
        $names = array_column($this->decode($res)['report']['payload']['milestones'], 'name');

        $this->assertSame(['Global milestone', 'Project milestone'], $names, 'all upcoming milestones, ascending, no scoping');
    }

    // --- Archive ----------------------------------------------------------

    public function testArchiveListsNewestFirstWithMetadata(): void
    {
        $mk = function (string $generatedAt, string $type) {
            $this->db->prepare(
                'INSERT INTO reports (id, generated_at, type, triggered_by, window_days, payload_json, markdown)
                 VALUES (:id, :g, :t, :u, 7, :p, :m)'
            )->execute([
                'id' => Uuid::uuid4()->toString(), 'g' => $generatedAt, 't' => $type,
                'u' => $this->user['id'], 'p' => '{}', 'm' => '# x',
            ]);
        };
        $mk('2026-06-01 09:00:00', 'ad_hoc');
        $mk('2026-06-03 09:00:00', 'scheduled');
        $mk('2026-06-02 09:00:00', 'ad_hoc');

        $res = $this->request('GET', '/reports', null, $this->token);
        $reports = $this->decode($res)['reports'];

        $this->assertCount(3, $reports);
        $this->assertSame('2026-06-03', substr($reports[0]['generatedAt'], 0, 10), 'newest first');
        $this->assertSame('scheduled', $reports[0]['type']);
        $this->assertSame(
            ['id' => $this->user['id'], 'displayName' => 'Doren Berge'],
            $reports[0]['triggeredBy']
        );
        $this->assertSame('2026-06-01', substr($reports[2]['generatedAt'], 0, 10));
    }

    public function testTriggeredByIsNullWhenNoTriggerer(): void
    {
        // ON DELETE SET NULL: a departed user's reports survive with a null trigger.
        $this->db->prepare(
            'INSERT INTO reports (id, generated_at, type, triggered_by, window_days, payload_json, markdown)
             VALUES (:id, :g, :t, NULL, 7, :p, :m)'
        )->execute([
            'id' => Uuid::uuid4()->toString(), 'g' => '2026-06-05 09:00:00',
            't' => 'scheduled', 'p' => '{}', 'm' => '# x',
        ]);

        $reports = $this->decode($this->request('GET', '/reports', null, $this->token))['reports'];
        $this->assertNull($reports[0]['triggeredBy'], 'null trigger renders as null, not an object');
    }

    // --- Fetch payload + markdown ----------------------------------------

    public function testGetReportReturnsStoredPayload(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'A task', 'status' => 'review']);
        $id = $this->decode($this->request('POST', '/reports', null, $this->token))['report']['id'];

        $res = $this->request('GET', "/reports/{$id}", null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $payload = $this->decode($res)['report']['payload'];
        $this->assertContains('A task', $this->payloadTaskTitles($payload));
    }

    public function testGetMarkdownReturnsTextDownload(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'A task']);
        $id = $this->decode($this->request('POST', '/reports', null, $this->token))['report']['id'];

        $res = $this->request('GET', "/reports/{$id}/markdown", null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertStringContainsString('text/markdown', $res->getHeaderLine('Content-Type'));
        $this->assertStringContainsString('attachment', $res->getHeaderLine('Content-Disposition'));
        $this->assertStringContainsString('# Status Report', (string) $res->getBody());
    }

    public function testStoredPayloadAndMarkdownAreInParity(): void
    {
        $a = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $b = $this->seedProject($this->user['id'], ['name' => 'Gemini']);
        $this->seedTask($a, $this->user['id'], ['title' => 'Blocked thing', 'status' => 'blocked']);
        $this->seedTask($a, $this->user['id'], ['title' => 'Review thing', 'status' => 'review']);
        $this->seedTask($b, $this->user['id'], ['title' => 'Todo thing', 'status' => 'todo']);

        $id = $this->decode($this->request('POST', '/reports', null, $this->token))['report']['id'];
        $payload = $this->decode($this->request('GET', "/reports/{$id}", null, $this->token))['report']['payload'];
        $markdown = (string) $this->request('GET', "/reports/{$id}/markdown", null, $this->token)->getBody();

        // Every project name, group label, and task title in the payload is in the markdown.
        foreach ($payload['projects'] as $project) {
            $this->assertStringContainsString('## ' . $project['name'], $markdown);
            foreach ($project['groups'] as $group) {
                $this->assertStringContainsString('### ' . $group['label'], $markdown);
                foreach ($group['tasks'] as $task) {
                    $this->assertStringContainsString($task['title'], $markdown);
                }
            }
        }
    }

    // --- Subtask counts + assignees (exercises the IN-clause fetch paths) --

    public function testPayloadCarriesSubtaskCountsAndAssignees(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Apollo']);
        $taskId = $this->seedTask($projectId, $this->user['id'], ['title' => 'With detail', 'status' => 'todo']);
        $this->seedSubtask($taskId, true);
        $this->seedSubtask($taskId, false);
        $this->assignTask($taskId, $this->user['id']);

        $res = $this->request('POST', '/reports', null, $this->token);
        $payload = $this->decode($res)['report']['payload'];

        // payload_json is a MySQL JSON column, which normalizes object key order;
        // assert by key, not by array shape (list order is preserved, key order is not).
        $task = $payload['projects'][0]['groups'][0]['tasks'][0];
        $this->assertSame(1, $task['subtasks']['completed']);
        $this->assertSame(2, $task['subtasks']['total']);
        $this->assertCount(1, $task['assignees']);
        $this->assertSame($this->user['id'], $task['assignees'][0]['id']);
        $this->assertSame('Doren Berge', $task['assignees'][0]['name']);
    }

    // --- Empty states -----------------------------------------------------

    public function testEmptyStateWhenNoProjectsIncluded(): void
    {
        $only = $this->seedProject($this->user['id']);
        $this->excludeProject($only);

        $res = $this->request('POST', '/reports', null, $this->token);
        $report = $this->decode($res)['report'];

        $this->assertTrue($report['payload']['projectsEmpty']);
        $md = (string) $this->request('GET', "/reports/{$report['id']}/markdown", null, $this->token)->getBody();
        $this->assertStringContainsString('No projects are included in the status report.', $md);
    }

    public function testProjectWithZeroTasksRendersHasTasksFalse(): void
    {
        $this->seedProject($this->user['id'], ['name' => 'Empty']);

        $res = $this->request('POST', '/reports', null, $this->token);
        $projects = $this->decode($res)['report']['payload']['projects'];

        $this->assertCount(1, $projects);
        $this->assertSame('Empty', $projects[0]['name']);
        $this->assertFalse($projects[0]['hasTasks']);
    }

    // --- Auth -------------------------------------------------------------

    public function testEndpointsRejectUnauthenticatedRequests(): void
    {
        $this->assertSame(401, $this->request('POST', '/reports', null, null)->getStatusCode());
        $this->assertSame(401, $this->request('GET', '/reports', null, null)->getStatusCode());

        $fakeId = Uuid::uuid4()->toString();
        $this->assertSame(401, $this->request('GET', "/reports/{$fakeId}", null, null)->getStatusCode());
        $this->assertSame(401, $this->request('GET', "/reports/{$fakeId}/markdown", null, null)->getStatusCode());
    }

    // --- Delete (admin-only hard delete) ----------------------------------

    public function testAdminDeleteRemovesReport(): void
    {
        $admin = $this->seedUser(['display_name' => 'Admin', 'role' => 'admin']);
        $adminToken = $this->tokenFor($admin);

        $id = $this->decode($this->request('POST', '/reports', null, $this->token))['report']['id'];

        $res = $this->request('DELETE', "/reports/{$id}", null, $adminToken);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('Report deleted successfully', $this->decode($res)['message']);

        $count = (int) $this->db->query('SELECT COUNT(*) FROM reports')->fetchColumn();
        $this->assertSame(0, $count, 'the report row is hard-deleted');
        $this->assertSame(404, $this->request('GET', "/reports/{$id}", null, $this->token)->getStatusCode());
    }

    public function testDeleteForbiddenForNonAdmin(): void
    {
        $id = $this->decode($this->request('POST', '/reports', null, $this->token))['report']['id'];

        // The default user is a member, not an admin.
        $res = $this->request('DELETE', "/reports/{$id}", null, $this->token);
        $this->assertSame(403, $res->getStatusCode());

        $count = (int) $this->db->query('SELECT COUNT(*) FROM reports')->fetchColumn();
        $this->assertSame(1, $count, 'the report survives a non-admin delete attempt');
    }

    public function testDeleteRejectsUnauthenticated(): void
    {
        $fakeId = Uuid::uuid4()->toString();
        $this->assertSame(401, $this->request('DELETE', "/reports/{$fakeId}", null, null)->getStatusCode());
    }

    public function testDeleteNotFound404(): void
    {
        $admin = $this->seedUser(['display_name' => 'Admin', 'role' => 'admin']);
        $adminToken = $this->tokenFor($admin);

        $res = $this->request('DELETE', '/reports/' . Uuid::uuid4(), null, $adminToken);
        $this->assertSame(404, $res->getStatusCode());
    }
}
