<?php

namespace Tests\Integration;

/** Validates the integration harness plumbing (boot, DB, auth, dispatch). */
final class HarnessSmokeTest extends IntegrationTestCase
{
    public function testHealthEndpoint(): void
    {
        $response = $this->request('GET', '/health');
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('ok', $this->decode($response)['status']);
    }

    public function testTasksRequireAuth(): void
    {
        $response = $this->request('GET', '/tasks');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function testAuthedTasksEmptyList(): void
    {
        $user = $this->seedUser();
        $response = $this->request('GET', '/tasks', null, $this->tokenFor($user));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(['tasks' => []], $this->decode($response));
    }

    public function testSeedAndFetchTask(): void
    {
        $user = $this->seedUser();
        $project = $this->seedProject($user['id']);
        $taskId = $this->seedTask($project, $user['id'], ['title' => 'Smoke Task']);

        $response = $this->request('GET', "/tasks/{$taskId}", null, $this->tokenFor($user));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('Smoke Task', $this->decode($response)['task']['title']);
    }
}
