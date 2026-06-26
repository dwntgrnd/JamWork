<?php

namespace Tests\Integration;

/**
 * CC42: the project-update path accepts include_in_master_timeline, mirroring
 * include_in_status_report — default ON, serialized as includeInMasterTimeline,
 * settable on create and update. The master-timeline filtering itself is
 * client-side; the API's job is only to store and return the flag.
 */
final class ProjectMasterTimelineFlagTest extends IntegrationTestCase
{
    private array $user;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->seedUser();
        $this->token = $this->tokenFor($this->user);
    }

    public function testNewProjectDefaultsToIncludedViaApi(): void
    {
        $res = $this->request('POST', '/projects', ['name' => 'Apollo'], $this->token);

        $this->assertSame(201, $res->getStatusCode());
        $project = $this->decode($res)['project'];
        $this->assertTrue($project['includeInMasterTimeline'], 'default ON');
    }

    public function testCreateWithMasterTimelineFalse(): void
    {
        $res = $this->request('POST', '/projects', [
            'name' => 'Side Project',
            'includeInMasterTimeline' => false,
        ], $this->token);

        $project = $this->decode($res)['project'];
        $this->assertFalse($project['includeInMasterTimeline']);

        // Persisted as 0.
        $value = $this->db->query(
            "SELECT include_in_master_timeline FROM projects WHERE id = '{$project['id']}'"
        )->fetchColumn();
        $this->assertSame(0, (int) $value);
    }

    public function testUpdateTogglesMasterTimeline(): void
    {
        $projectId = $this->seedProject($this->user['id']);

        $off = $this->request('PUT', "/projects/{$projectId}", ['includeInMasterTimeline' => false], $this->token);
        $this->assertSame(200, $off->getStatusCode());
        $this->assertFalse($this->decode($off)['project']['includeInMasterTimeline']);

        $on = $this->request('PUT', "/projects/{$projectId}", ['includeInMasterTimeline' => true], $this->token);
        $this->assertTrue($this->decode($on)['project']['includeInMasterTimeline']);
    }

    public function testUpdatingMasterTimelineLeavesOtherFlagsUntouched(): void
    {
        $projectId = $this->seedProject($this->user['id']);

        $res = $this->request('PUT', "/projects/{$projectId}", ['includeInMasterTimeline' => false], $this->token);
        $project = $this->decode($res)['project'];

        // The three pre-existing flags keep their defaults (ON).
        $this->assertTrue($project['sprintPlanning']);
        $this->assertTrue($project['includeInStatusReport']);
        $this->assertTrue($project['defaultNotifyEnabled']);
        $this->assertFalse($project['includeInMasterTimeline']);
    }
}
