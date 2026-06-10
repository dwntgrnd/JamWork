<?php

namespace Tests\Integration;

/**
 * Phase 2 (CC30a): the tasks.completed_at write path. completed_at must be set
 * when a task transitions TO 'done' and cleared when it leaves 'done', across
 * every status-writing path (create, update, bulk-update) — and never touched
 * by an unrelated edit. Recurrence clones start fresh (NULL). Per Decision 3,
 * completed_at is not exposed in the API, so assertions read the column directly.
 */
final class StatusReportCompletedAtTest extends IntegrationTestCase
{
    private array $user;
    private string $token;
    private string $projectId;

    private const SEED_COMPLETED_AT = '2026-06-01 12:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->seedUser();
        $this->token = $this->tokenFor($this->user);
        $this->projectId = $this->seedProject($this->user['id']);
    }

    /** Read the raw completed_at column for a task (NULL when unset). */
    private function completedAt(string $taskId): ?string
    {
        $stmt = $this->db->prepare('SELECT completed_at FROM tasks WHERE id = :id');
        $stmt->execute(['id' => $taskId]);
        return $stmt->fetchColumn() ?: null;
    }

    public function testCreateAsDoneSetsCompletedAt(): void
    {
        $res = $this->request('POST', '/tasks', [
            'title' => 'Born done',
            'projectId' => $this->projectId,
            'status' => 'done',
        ], $this->token);

        $this->assertSame(201, $res->getStatusCode());
        $taskId = $this->decode($res)['task']['id'];
        $this->assertNotNull($this->completedAt($taskId), 'create-as-done sets completed_at');
    }

    public function testStatusToDoneSetsCompletedAt(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id'], ['status' => 'todo']);

        $res = $this->request('PUT', "/tasks/{$taskId}", ['status' => 'done'], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertNotNull($this->completedAt($taskId), 'todo -> done sets completed_at');
    }

    public function testStatusOutOfDoneClearsCompletedAt(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id'], [
            'status' => 'done',
            'completed_at' => self::SEED_COMPLETED_AT,
        ]);

        $res = $this->request('PUT', "/tasks/{$taskId}", ['status' => 'todo'], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertNull($this->completedAt($taskId), 'done -> todo clears completed_at');
    }

    public function testUnrelatedEditOnDoneTaskLeavesCompletedAt(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id'], [
            'status' => 'done',
            'completed_at' => self::SEED_COMPLETED_AT,
        ]);

        $res = $this->request('PUT', "/tasks/{$taskId}", ['title' => 'Renamed'], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(
            self::SEED_COMPLETED_AT,
            $this->completedAt($taskId),
            'editing an unrelated field on a done task must not change completed_at'
        );
    }

    public function testBulkUpdateToDoneSetsCompletedAt(): void
    {
        $a = $this->seedTask($this->projectId, $this->user['id'], ['status' => 'todo']);
        $b = $this->seedTask($this->projectId, $this->user['id'], ['status' => 'in_progress']);

        $res = $this->request('PUT', '/tasks/bulk-update', [
            'taskIds' => [$a, $b],
            'fields' => ['status' => 'done'],
        ], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertNotNull($this->completedAt($a), 'bulk to done sets completed_at (a)');
        $this->assertNotNull($this->completedAt($b), 'bulk to done sets completed_at (b)');
    }

    public function testBulkUpdateOutOfDoneClearsCompletedAt(): void
    {
        $a = $this->seedTask($this->projectId, $this->user['id'], [
            'status' => 'done',
            'completed_at' => self::SEED_COMPLETED_AT,
        ]);
        $b = $this->seedTask($this->projectId, $this->user['id'], [
            'status' => 'done',
            'completed_at' => self::SEED_COMPLETED_AT,
        ]);

        $res = $this->request('PUT', '/tasks/bulk-update', [
            'taskIds' => [$a, $b],
            'fields' => ['status' => 'todo'],
        ], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertNull($this->completedAt($a), 'bulk out of done clears completed_at (a)');
        $this->assertNull($this->completedAt($b), 'bulk out of done clears completed_at (b)');
    }

    public function testRecurrenceCloneStartsWithNullCompletedAt(): void
    {
        $taskId = $this->seedTask($this->projectId, $this->user['id'], [
            'status' => 'todo',
            'recurrence' => 'weekly',
            'due_date' => '2026-12-01 00:00:00',
        ]);

        $res = $this->request('PUT', "/tasks/{$taskId}", ['status' => 'done'], $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);

        // Parent transitioned to done -> completed_at set.
        $this->assertNotNull($this->completedAt($taskId), 'completed recurring parent gets completed_at');

        // The fresh recurrence clone starts NULL.
        $this->assertNotNull($body['clonedTask'] ?? null, 'a recurring done task produces a clone');
        $this->assertNull(
            $this->completedAt($body['clonedTask']['id']),
            'recurrence clone starts with NULL completed_at'
        );
    }
}
