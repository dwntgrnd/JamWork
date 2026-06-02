<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Characterization tests for every /tasks endpoint. These lock the current
 * HTTP behavior (status, JSON shape, DB side-effects, validation, auth) so the
 * route logic can be extracted into a service without changing behavior.
 */
final class TaskRoutesTest extends IntegrationTestCase
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

    public function testAllEndpointsRequireAuth(): void
    {
        $this->assertSame(401, $this->request('GET', '/tasks')->getStatusCode());
        $this->assertSame(401, $this->request('POST', '/tasks', ['title' => 'x'])->getStatusCode());
        $this->assertSame(401, $this->request('GET', '/tasks/' . Uuid::uuid4())->getStatusCode());
    }

    // === GET /tasks (list) ================================================

    public function testListEmpty(): void
    {
        $res = $this->request('GET', '/tasks', null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(['tasks' => []], $this->decode($res));
    }

    public function testListReturnsMappedTaskShape(): void
    {
        $this->seedTask($this->projectId, $this->user['id'], ['title' => 'A']);
        $body = $this->decode($this->request('GET', '/tasks', null, $this->token));

        $this->assertCount(1, $body['tasks']);
        $task = $body['tasks'][0];
        foreach (['id', 'title', 'status', 'priority', 'sortOrder', 'projectId', 'createdById',
                  'assignees', 'labels', 'subtasks', 'creator', 'links', 'project'] as $key) {
            $this->assertArrayHasKey($key, $task, "task missing key {$key}");
        }
        $this->assertSame('A', $task['title']);
        $this->assertSame($this->projectId, $task['project']['id']);
    }

    public function testListExcludesSoftDeleted(): void
    {
        $this->seedTask($this->projectId, $this->user['id'], ['title' => 'live']);
        $deleted = $this->seedTask($this->projectId, $this->user['id'], ['title' => 'dead']);
        $this->db->prepare('UPDATE tasks SET deleted_at = NOW() WHERE id = :id')->execute(['id' => $deleted]);

        $body = $this->decode($this->request('GET', '/tasks', null, $this->token));
        $this->assertCount(1, $body['tasks']);
        $this->assertSame('live', $body['tasks'][0]['title']);
    }

    public function testListFilterByProjectId(): void
    {
        $other = $this->seedProject($this->user['id'], ['name' => 'Other']);
        $this->seedTask($this->projectId, $this->user['id']);
        $this->seedTask($other, $this->user['id']);

        $body = $this->decode($this->request('GET', '/tasks?projectId=' . $this->projectId, null, $this->token));
        $this->assertCount(1, $body['tasks']);
        $this->assertSame($this->projectId, $body['tasks'][0]['projectId']);
    }

    public function testListFilterExcludeCompleted(): void
    {
        $this->seedTask($this->projectId, $this->user['id'], ['status' => 'todo']);
        $this->seedTask($this->projectId, $this->user['id'], ['status' => 'done']);

        $body = $this->decode($this->request('GET', '/tasks?excludeCompleted=true', null, $this->token));
        $this->assertCount(1, $body['tasks']);
        $this->assertSame('todo', $body['tasks'][0]['status']);
    }

    public function testListFilterAssigneeMe(): void
    {
        $mine = $this->seedTask($this->projectId, $this->user['id'], ['title' => 'mine']);
        $this->seedTask($this->projectId, $this->user['id'], ['title' => 'theirs']);
        $this->assignTask($mine, $this->user['id']);

        $body = $this->decode($this->request('GET', '/tasks?assigneeId=me', null, $this->token));
        $this->assertCount(1, $body['tasks']);
        $this->assertSame('mine', $body['tasks'][0]['title']);
    }

    // === POST /tasks (create) =============================================

    public function testCreateMinimal(): void
    {
        $res = $this->request('POST', '/tasks', [
            'title' => 'New Task',
            'projectId' => $this->projectId,
        ], $this->token);

        $this->assertSame(201, $res->getStatusCode());
        $task = $this->decode($res)['task'];
        $this->assertSame('New Task', $task['title']);
        $this->assertSame('todo', $task['status']);
        $this->assertSame('medium', $task['priority']);
        $this->assertTrue(Uuid::isValid($task['id']));

        $count = $this->db->query('SELECT COUNT(*) FROM tasks')->fetchColumn();
        $this->assertSame(1, (int) $count);
    }

    public function testCreateAssignsIncrementingSortOrder(): void
    {
        $a = $this->decode($this->request('POST', '/tasks', ['title' => 'a', 'projectId' => $this->projectId], $this->token))['task'];
        $b = $this->decode($this->request('POST', '/tasks', ['title' => 'b', 'projectId' => $this->projectId], $this->token))['task'];
        $this->assertSame(0, $a['sortOrder']);
        $this->assertSame(1, $b['sortOrder']);
    }

    public function testCreateWithAssigneesAndLabels(): void
    {
        $assignee = $this->seedUser(['email' => 'a@example.com']);
        $labelId = Uuid::uuid4()->toString();
        $this->db->prepare('INSERT INTO labels (id, name, color, created_by_id) VALUES (:id, :n, :c, :u)')
            ->execute(['id' => $labelId, 'n' => 'bug', 'c' => '#f00', 'u' => $this->user['id']]);

        $task = $this->decode($this->request('POST', '/tasks', [
            'title' => 'T',
            'projectId' => $this->projectId,
            'assigneeIds' => [$assignee['id']],
            'labelIds' => [$labelId],
        ], $this->token))['task'];

        $this->assertCount(1, $task['assignees']);
        $this->assertSame($assignee['id'], $task['assignees'][0]['userId']);
        $this->assertCount(1, $task['labels']);
        $this->assertSame($labelId, $task['labels'][0]['labelId']);
    }

    public function testCreateSeedsNotifyEnabledFromProjectDefault(): void
    {
        $this->db->prepare('UPDATE projects SET default_notify_enabled = 0 WHERE id = :id')->execute(['id' => $this->projectId]);
        $task = $this->decode($this->request('POST', '/tasks', ['title' => 'T', 'projectId' => $this->projectId], $this->token))['task'];
        $this->assertFalse($task['notifyEnabled']);
    }

    public function testCreateMissingTitle400(): void
    {
        $res = $this->request('POST', '/tasks', ['projectId' => $this->projectId], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testCreateBadStatus400(): void
    {
        $res = $this->request('POST', '/tasks', ['title' => 'x', 'projectId' => $this->projectId, 'status' => 'nope'], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testCreateUnknownProject404(): void
    {
        $res = $this->request('POST', '/tasks', ['title' => 'x', 'projectId' => Uuid::uuid4()->toString()], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Project not found', $this->decode($res)['error']);
    }

    // === GET /tasks/{id} ==================================================

    public function testGetByIdBadUuid400(): void
    {
        $this->assertSame(400, $this->request('GET', '/tasks/not-a-uuid', null, $this->token)->getStatusCode());
    }

    public function testGetByIdNotFound404(): void
    {
        $this->assertSame(404, $this->request('GET', '/tasks/' . Uuid::uuid4(), null, $this->token)->getStatusCode());
    }

    public function testGetByIdSoftDeleted404(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $this->db->prepare('UPDATE tasks SET deleted_at = NOW() WHERE id = :id')->execute(['id' => $id]);
        $this->assertSame(404, $this->request('GET', "/tasks/{$id}", null, $this->token)->getStatusCode());
    }

    // === PUT /tasks/{id} (update) =========================================

    public function testUpdateTitle(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id'], ['title' => 'old']);
        $res = $this->request('PUT', "/tasks/{$id}", ['title' => 'new'], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);
        $this->assertSame('new', $body['task']['title']);
        $this->assertNull($body['clonedTask']);
    }

    public function testUpdateNotFound404(): void
    {
        $this->assertSame(404, $this->request('PUT', '/tasks/' . Uuid::uuid4(), ['title' => 'x'], $this->token)->getStatusCode());
    }

    public function testUpdateRecurrenceClonesOnDone(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id'], [
            'title' => 'Recurring',
            'status' => 'todo',
            'recurrence' => 'weekly',
            'due_date' => '2026-01-01 09:00:00',
        ]);

        $body = $this->decode($this->request('PUT', "/tasks/{$id}", ['status' => 'done'], $this->token));

        $this->assertSame('done', $body['task']['status']);
        $this->assertNotNull($body['clonedTask']);
        $this->assertSame('todo', $body['clonedTask']['status']);
        $this->assertSame('Recurring', $body['clonedTask']['title']);
        // Cloned due date is shifted +7 days.
        $this->assertSame('2026-01-08', substr($body['clonedTask']['dueDate'], 0, 10));

        $count = $this->db->query('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL')->fetchColumn();
        $this->assertSame(2, (int) $count);
    }

    public function testUpdateReplacesAssignees(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $u1 = $this->seedUser(['email' => 'u1@example.com']);
        $this->assignTask($id, $u1['id']);
        $u2 = $this->seedUser(['email' => 'u2@example.com']);

        $body = $this->decode($this->request('PUT', "/tasks/{$id}", ['assigneeIds' => [$u2['id']]], $this->token));
        $this->assertCount(1, $body['task']['assignees']);
        $this->assertSame($u2['id'], $body['task']['assignees'][0]['userId']);
    }

    // === PUT /tasks/{id}/move =============================================

    public function testMoveToAnotherProject(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $target = $this->seedProject($this->user['id'], ['name' => 'Target']);

        $body = $this->decode($this->request('PUT', "/tasks/{$id}/move", ['projectId' => $target], $this->token));
        $this->assertSame($target, $body['task']['projectId']);
    }

    public function testMoveTaskNotFound404(): void
    {
        $target = $this->seedProject($this->user['id']);
        $res = $this->request('PUT', '/tasks/' . Uuid::uuid4() . '/move', ['projectId' => $target], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Task not found', $this->decode($res)['error']);
    }

    public function testMoveTargetProjectNotFound404(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $res = $this->request('PUT', "/tasks/{$id}/move", ['projectId' => Uuid::uuid4()->toString()], $this->token);
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Target project not found', $this->decode($res)['error']);
    }

    // === DELETE /tasks/{id} ===============================================

    public function testDeleteSoftDeletes(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $res = $this->request('DELETE', "/tasks/{$id}", null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('Task deleted successfully', $this->decode($res)['message']);

        $deletedAt = $this->db->query("SELECT deleted_at FROM tasks WHERE id = '{$id}'")->fetchColumn();
        $this->assertNotNull($deletedAt);
        $this->assertSame(404, $this->request('GET', "/tasks/{$id}", null, $this->token)->getStatusCode());
    }

    public function testDeleteNotFound404(): void
    {
        $this->assertSame(404, $this->request('DELETE', '/tasks/' . Uuid::uuid4(), null, $this->token)->getStatusCode());
    }

    // === PUT /tasks/reorder ===============================================

    public function testReorder(): void
    {
        $a = $this->seedTask($this->projectId, $this->user['id'], ['sort_order' => 0]);
        $b = $this->seedTask($this->projectId, $this->user['id'], ['sort_order' => 1]);

        $res = $this->request('PUT', '/tasks/reorder', ['taskIds' => [$b, $a]], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('Tasks reordered successfully', $this->decode($res)['message']);

        $this->assertSame(0, (int) $this->db->query("SELECT sort_order FROM tasks WHERE id = '{$b}'")->fetchColumn());
        $this->assertSame(1, (int) $this->db->query("SELECT sort_order FROM tasks WHERE id = '{$a}'")->fetchColumn());
    }

    public function testReorderRequiresTaskIds400(): void
    {
        $this->assertSame(400, $this->request('PUT', '/tasks/reorder', [], $this->token)->getStatusCode());
    }

    // === PUT /tasks/bulk-update ===========================================

    public function testBulkUpdate(): void
    {
        $a = $this->seedTask($this->projectId, $this->user['id'], ['status' => 'todo']);
        $b = $this->seedTask($this->projectId, $this->user['id'], ['status' => 'todo']);

        $res = $this->request('PUT', '/tasks/bulk-update', [
            'taskIds' => [$a, $b],
            'fields' => ['status' => 'done'],
        ], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(2, $this->decode($res)['count']);
        $this->assertSame('done', $this->db->query("SELECT status FROM tasks WHERE id = '{$a}'")->fetchColumn());
    }

    public function testBulkUpdateDisallowedField400(): void
    {
        $id = $this->seedTask($this->projectId, $this->user['id']);
        $res = $this->request('PUT', '/tasks/bulk-update', [
            'taskIds' => [$id],
            'fields' => ['title' => 'hacked'],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
        $this->assertStringContainsString('not allowed', $this->decode($res)['error']);
    }

    public function testBulkUpdateEmptyTaskIds400(): void
    {
        $res = $this->request('PUT', '/tasks/bulk-update', ['taskIds' => [], 'fields' => ['status' => 'done']], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    // === POST /tasks/bulk-delete ==========================================

    public function testBulkDelete(): void
    {
        $a = $this->seedTask($this->projectId, $this->user['id']);
        $b = $this->seedTask($this->projectId, $this->user['id']);

        $res = $this->request('POST', '/tasks/bulk-delete', ['taskIds' => [$a, $b]], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(2, $this->decode($res)['count']);
        $this->assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL')->fetchColumn());
    }

    // === Subtasks =========================================================

    public function testCreateSubtask(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id']);
        $res = $this->request('POST', "/tasks/{$taskId}/subtasks", ['title' => 'Sub'], $this->token);
        $this->assertSame(201, $res->getStatusCode());
        $sub = $this->decode($res)['subtask'];
        $this->assertSame('Sub', $sub['title']);
        $this->assertFalse($sub['completed']);
        $this->assertSame(0, $sub['sortOrder']);
        $this->assertSame($taskId, $sub['taskId']);
    }

    public function testCreateSubtaskParentNotFound404(): void
    {
        $res = $this->request('POST', '/tasks/' . Uuid::uuid4() . '/subtasks', ['title' => 'x'], $this->token);
        $this->assertSame(404, $res->getStatusCode());
    }

    public function testCreateSubtaskRequiresTitle400(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id']);
        $this->assertSame(400, $this->request('POST', "/tasks/{$taskId}/subtasks", [], $this->token)->getStatusCode());
    }

    public function testUpdateSubtaskToggleCompleted(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id']);
        $subId = $this->decode($this->request('POST', "/tasks/{$taskId}/subtasks", ['title' => 'S'], $this->token))['subtask']['id'];

        $res = $this->request('PUT', "/tasks/{$taskId}/subtasks/{$subId}", ['completed' => true], $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->decode($res)['subtask']['completed']);
    }

    public function testUpdateSubtaskRequiresAField400(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id']);
        $subId = $this->decode($this->request('POST', "/tasks/{$taskId}/subtasks", ['title' => 'S'], $this->token))['subtask']['id'];
        $res = $this->request('PUT', "/tasks/{$taskId}/subtasks/{$subId}", [], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testDeleteSubtask(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id']);
        $subId = $this->decode($this->request('POST', "/tasks/{$taskId}/subtasks", ['title' => 'S'], $this->token))['subtask']['id'];

        $res = $this->request('DELETE', "/tasks/{$taskId}/subtasks/{$subId}", null, $this->token);
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('Subtask deleted successfully', $this->decode($res)['message']);
        $this->assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM subtasks')->fetchColumn());
    }

    public function testSubtaskBadUuid400(): void
    {
        $this->assertSame(400, $this->request('POST', '/tasks/bad/subtasks', ['title' => 'x'], $this->token)->getStatusCode());
    }
}
