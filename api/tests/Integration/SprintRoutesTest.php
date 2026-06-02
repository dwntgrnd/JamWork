<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Characterization tests for every /sprints endpoint. Lock current HTTP
 * behavior before extracting SprintService.
 */
final class SprintRoutesTest extends IntegrationTestCase
{
    private array $user;
    private string $token;
    private string $projectId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->seedUser();
        $this->token = $this->tokenFor($this->user);
        $this->projectId = $this->seedProject($this->user['id']);
    }

    // === Auth =============================================================

    public function testRequiresAuth(): void
    {
        $this->assertSame(401, $this->request('GET', '/sprints')->getStatusCode());
        $this->assertSame(401, $this->request('POST', '/sprints', ['name' => 'x'])->getStatusCode());
    }

    // === GET /sprints =====================================================

    public function testListEmpty(): void
    {
        $res = $this->request('GET', '/sprints', null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(['sprints' => []], $this->decode($res));
    }

    public function testListMappedShapeWithCount(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['name' => 'S1', 'project_id' => $this->projectId]);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId]);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId]);

        $body = $this->decode($this->request('GET', '/sprints', null, $this->token));
        $this->assertCount(1, $body['sprints']);
        $sprint = $body['sprints'][0];
        foreach (['id', 'name', 'startDate', 'endDate', 'status', 'projectId', 'createdById', 'project', '_count'] as $key) {
            $this->assertArrayHasKey($key, $sprint, "missing {$key}");
        }
        $this->assertSame('S1', $sprint['name']);
        $this->assertSame(2, $sprint['_count']['tasks']);
        $this->assertSame($this->projectId, $sprint['project']['id']);
    }

    public function testListFilterByProject(): void
    {
        $other = $this->seedProject($this->user['id'], ['name' => 'Other']);
        $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $this->seedSprint($this->user['id'], ['project_id' => $other]);

        $body = $this->decode($this->request('GET', '/sprints?projectId=' . $this->projectId, null, $this->token));
        $this->assertCount(1, $body['sprints']);
        $this->assertSame($this->projectId, $body['sprints'][0]['projectId']);
    }

    public function testListIncludeStats(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'status' => 'done']);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'status' => 'todo']);

        $body = $this->decode($this->request('GET', '/sprints?include=stats', null, $this->token));
        $stats = $body['sprints'][0]['stats'];
        $this->assertSame(2, $stats['taskCount']);
        $this->assertSame(1, $stats['completedCount']);
    }

    public function testListIncludeTasks(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'title' => 'T1']);

        $body = $this->decode($this->request('GET', '/sprints?includeTasks=true', null, $this->token));
        $this->assertArrayHasKey('tasks', $body['sprints'][0]);
        $this->assertCount(1, $body['sprints'][0]['tasks']);
        $this->assertSame('T1', $body['sprints'][0]['tasks'][0]['title']);
    }

    // === POST /sprints ====================================================

    public function testCreateMinimal(): void
    {
        $res = $this->request('POST', '/sprints', [
            'name' => 'Sprint 1',
            'startDate' => '2026-02-01T00:00:00Z',
            'endDate' => '2026-02-14T00:00:00Z',
        ], $this->token);

        $this->assertSame(201, $res->getStatusCode());
        $sprint = $this->decode($res)['sprint'];
        $this->assertSame('Sprint 1', $sprint['name']);
        $this->assertSame('active', $sprint['status']);
        $this->assertNull($sprint['projectId']);
        $this->assertSame(1, (int) $this->db->query('SELECT COUNT(*) FROM sprints')->fetchColumn());
    }

    public function testCreateWithProject(): void
    {
        $sprint = $this->decode($this->request('POST', '/sprints', [
            'name' => 'P Sprint',
            'startDate' => '2026-02-01T00:00:00Z',
            'endDate' => '2026-02-14T00:00:00Z',
            'projectId' => $this->projectId,
        ], $this->token))['sprint'];
        $this->assertSame($this->projectId, $sprint['projectId']);
    }

    public function testCreateEndBeforeStart400(): void
    {
        $res = $this->request('POST', '/sprints', [
            'name' => 'Bad',
            'startDate' => '2026-02-14T00:00:00Z',
            'endDate' => '2026-02-01T00:00:00Z',
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
        $this->assertSame('End date must be after start date', $this->decode($res)['error']);
    }

    public function testCreateUnknownProject404(): void
    {
        $res = $this->request('POST', '/sprints', [
            'name' => 'X',
            'startDate' => '2026-02-01T00:00:00Z',
            'endDate' => '2026-02-14T00:00:00Z',
            'projectId' => Uuid::uuid4()->toString(),
        ], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Project not found', $this->decode($res)['error']);
    }

    public function testCreateMissingName400(): void
    {
        $res = $this->request('POST', '/sprints', [
            'startDate' => '2026-02-01T00:00:00Z',
            'endDate' => '2026-02-14T00:00:00Z',
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    // === GET /sprints/{id} ================================================

    public function testGetByIdBadUuid400(): void
    {
        $this->assertSame(400, $this->request('GET', '/sprints/nope', null, $this->token)->getStatusCode());
    }

    public function testGetByIdNotFound404(): void
    {
        $this->assertSame(404, $this->request('GET', '/sprints/' . Uuid::uuid4(), null, $this->token)->getStatusCode());
    }

    public function testGetByIdWithTasks(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'title' => 'In Sprint']);

        $body = $this->decode($this->request('GET', "/sprints/{$sprintId}", null, $this->token));
        $this->assertSame($sprintId, $body['sprint']['id']);
        $this->assertCount(1, $body['sprint']['tasks']);
        $this->assertSame('In Sprint', $body['sprint']['tasks'][0]['title']);
    }

    // === PUT /sprints/{id} ================================================

    public function testUpdateName(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['name' => 'old']);
        $res = $this->request('PUT', "/sprints/{$sprintId}", ['name' => 'new'], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('new', $this->decode($res)['sprint']['name']);
    }

    public function testUpdateNotFound404(): void
    {
        $this->assertSame(404, $this->request('PUT', '/sprints/' . Uuid::uuid4(), ['name' => 'x'], $this->token)->getStatusCode());
    }

    public function testUpdateBadDateOrder400(): void
    {
        $sprintId = $this->seedSprint($this->user['id']);
        $res = $this->request('PUT', "/sprints/{$sprintId}", [
            'startDate' => '2026-03-10T00:00:00Z',
            'endDate' => '2026-03-01T00:00:00Z',
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    // === PUT /sprints/{id}/close ==========================================

    public function testCloseToBacklog(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $done = $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'status' => 'done']);
        $todo = $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'status' => 'todo']);

        $res = $this->request('PUT', "/sprints/{$sprintId}/close", ['action' => 'backlog'], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);
        $this->assertSame('Sprint closed successfully', $body['message']);
        $this->assertCount(1, $body['incompleteTasks']);

        $this->assertSame('completed', $this->db->query("SELECT status FROM sprints WHERE id = '{$sprintId}'")->fetchColumn());
        $this->assertNull($this->db->query("SELECT sprint_id FROM tasks WHERE id = '{$todo}'")->fetchColumn());
        // The done task stays in the sprint.
        $this->assertSame($sprintId, $this->db->query("SELECT sprint_id FROM tasks WHERE id = '{$done}'")->fetchColumn());
    }

    public function testCloseToNextSprint(): void
    {
        $sprintId = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId]);
        $next = $this->seedSprint($this->user['id'], ['project_id' => $this->projectId, 'name' => 'Next']);
        $todo = $this->seedTask($this->projectId, $this->user['id'], ['sprint_id' => $sprintId, 'status' => 'todo']);

        $res = $this->request('PUT', "/sprints/{$sprintId}/close", [
            'action' => 'next_sprint',
            'nextSprintId' => $next,
        ], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame($next, $this->db->query("SELECT sprint_id FROM tasks WHERE id = '{$todo}'")->fetchColumn());
    }

    public function testCloseNextSprintRequiresId400(): void
    {
        $sprintId = $this->seedSprint($this->user['id']);
        $res = $this->request('PUT', "/sprints/{$sprintId}/close", ['action' => 'next_sprint'], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testCloseSprintNotFound404(): void
    {
        $res = $this->request('PUT', '/sprints/' . Uuid::uuid4() . '/close', ['action' => 'backlog'], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Sprint not found', $this->decode($res)['error']);
    }

    public function testCloseNextSprintNotFound404(): void
    {
        $sprintId = $this->seedSprint($this->user['id']);
        $res = $this->request('PUT', "/sprints/{$sprintId}/close", [
            'action' => 'next_sprint',
            'nextSprintId' => Uuid::uuid4()->toString(),
        ], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Next sprint not found', $this->decode($res)['error']);
    }

    // === DELETE /sprints/{id} =============================================

    public function testDelete(): void
    {
        $sprintId = $this->seedSprint($this->user['id']);
        $res = $this->request('DELETE', "/sprints/{$sprintId}", null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('Sprint deleted successfully', $this->decode($res)['message']);
        $this->assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM sprints')->fetchColumn());
    }

    public function testDeleteNotFound404(): void
    {
        $this->assertSame(404, $this->request('DELETE', '/sprints/' . Uuid::uuid4(), null, $this->token)->getStatusCode());
    }

    public function testDeleteBadUuid400(): void
    {
        $this->assertSame(400, $this->request('DELETE', '/sprints/bad', null, $this->token)->getStatusCode());
    }
}
