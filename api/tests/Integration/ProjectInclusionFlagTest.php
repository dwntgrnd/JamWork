<?php

namespace Tests\Integration;

/**
 * Phase 3d (CC30a): the project-update path accepts include_in_status_report,
 * mirroring sprint_planning — default ON, serialized as includeInStatusReport,
 * settable on create and update, and read by report generation.
 */
final class ProjectInclusionFlagTest extends IntegrationTestCase
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
        $this->assertTrue($project['includeInStatusReport'], 'default ON');
    }

    public function testCreateWithInclusionFalse(): void
    {
        $res = $this->request('POST', '/projects', [
            'name' => 'Side Project',
            'includeInStatusReport' => false,
        ], $this->token);

        $project = $this->decode($res)['project'];
        $this->assertFalse($project['includeInStatusReport']);

        // Persisted as 0.
        $value = $this->db->query(
            "SELECT include_in_status_report FROM projects WHERE id = '{$project['id']}'"
        )->fetchColumn();
        $this->assertSame(0, (int) $value);
    }

    public function testUpdateTogglesInclusion(): void
    {
        $projectId = $this->seedProject($this->user['id']);

        $off = $this->request('PUT', "/projects/{$projectId}", ['includeInStatusReport' => false], $this->token);
        $this->assertSame(200, $off->getStatusCode());
        $this->assertFalse($this->decode($off)['project']['includeInStatusReport']);

        $on = $this->request('PUT', "/projects/{$projectId}", ['includeInStatusReport' => true], $this->token);
        $this->assertTrue($this->decode($on)['project']['includeInStatusReport']);
    }

    public function testTogglingOffViaApiExcludesProjectFromReport(): void
    {
        $projectId = $this->seedProject($this->user['id'], ['name' => 'Noisy']);
        $this->seedTask($projectId, $this->user['id'], ['title' => 'Noise']);

        $this->request('PUT', "/projects/{$projectId}", ['includeInStatusReport' => false], $this->token);

        $res = $this->request('POST', '/reports', null, $this->token);
        $names = array_column($this->decode($res)['report']['payload']['projects'], 'name');
        $this->assertNotContains('Noisy', $names, 'API toggle is honored at generation time');
    }
}
