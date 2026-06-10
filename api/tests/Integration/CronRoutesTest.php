<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * The shared-secret cron endpoint (CC32a, Phase 5). Exercises auth (503 unset /
 * 401 wrong), the schedule gate, and the graceful-skip branches (no projects, no
 * recipients, no SMTP) — without actually sending email (the test env has no SMTP
 * configured, so Mailer::isConfigured() is false). Also verifies the persisted
 * report is a real 'scheduled' archive entry with triggered_by = null.
 */
final class CronRoutesTest extends IntegrationTestCase
{
    private const SECRET = 'test-cron-secret-abc123';
    private const PATH = '/cron/generate-report';

    protected function tearDown(): void
    {
        unset($_ENV['CRON_SECRET']);
        parent::tearDown();
    }

    private function auth(string $secret = self::SECRET): array
    {
        return ['Authorization' => 'Bearer ' . $secret];
    }

    private function enableSchedule(bool $enabled = true): void
    {
        $this->db->prepare(
            'INSERT INTO report_schedule (id, enabled, day_of_week, send_time_utc, frequency)
             VALUES (:id, :enabled, 1, "09:00:00", "weekly")'
        )->execute(['id' => Uuid::uuid4()->toString(), 'enabled' => $enabled ? 1 : 0]);
    }

    private function addRecipient(string $userId, bool $enabled = true): void
    {
        $this->db->prepare(
            'INSERT INTO report_recipients (id, user_id, enabled) VALUES (:id, :user_id, :enabled)'
        )->execute(['id' => Uuid::uuid4()->toString(), 'user_id' => $userId, 'enabled' => $enabled ? 1 : 0]);
    }

    // --- Auth ---------------------------------------------------------------

    public function testReturns503WhenSecretNotConfigured(): void
    {
        // CRON_SECRET intentionally unset.
        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(503, $res->getStatusCode());
        $this->assertSame('Cron endpoint not configured', $this->decode($res)['error']);
    }

    public function testReturns401OnWrongSecret(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $res = $this->request('POST', self::PATH, null, null, $this->auth('not-the-secret'));
        $this->assertSame(401, $res->getStatusCode());
    }

    public function testReturns401OnMissingHeader(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $res = $this->request('POST', self::PATH, null, null);
        $this->assertSame(401, $res->getStatusCode());
    }

    // --- Schedule gate ------------------------------------------------------

    public function testSkipsWhenNoScheduleRow(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('schedule_disabled', $this->decode($res)['skipped']);
    }

    public function testSkipsWhenScheduleDisabled(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $this->enableSchedule(false);
        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('schedule_disabled', $this->decode($res)['skipped']);

        // Nothing generated.
        $this->assertSame(0, (int) $this->db->query('SELECT COUNT(*) FROM reports')->fetchColumn());
    }

    // --- Generation branches ------------------------------------------------

    public function testGeneratesButSkipsEmailWhenNoProjectsIncluded(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $this->enableSchedule();
        // No projects at all → payload.projectsEmpty is true.

        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);
        $this->assertTrue($body['generated']);
        $this->assertSame(0, $body['emailsSent']);
        $this->assertSame('no_projects_included', $body['note']);
        $this->assertSame(1, (int) $this->db->query('SELECT COUNT(*) FROM reports')->fetchColumn());
    }

    public function testGeneratesButSkipsEmailWhenNoRecipients(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $user = $this->seedUser();
        $this->seedProject($user['id'], ['name' => 'Apollo']); // included by default
        $this->enableSchedule();
        // No enabled recipient rows.

        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);
        $this->assertTrue($body['generated']);
        $this->assertSame(0, $body['emailsSent']);
    }

    public function testGeneratesButSkipsEmailWhenSmtpNotConfigured(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $user = $this->seedUser();
        $this->seedProject($user['id'], ['name' => 'Apollo']);
        $this->seedTask($this->seedProject($user['id'], ['name' => 'Gemini']), $user['id'], ['title' => 'Do thing']);
        $this->addRecipient($user['id'], true);
        $this->enableSchedule();
        // Test env has no SMTP → Mailer::isConfigured() is false.

        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $this->assertSame(200, $res->getStatusCode());
        $body = $this->decode($res);
        $this->assertTrue($body['generated']);
        $this->assertSame(0, $body['emailsSent']);
        $this->assertSame('smtp_not_configured', $body['note']);
    }

    // --- Persistence --------------------------------------------------------

    public function testPersistsScheduledReportRetrievableFromArchive(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $user = $this->seedUser();
        $this->seedProject($user['id'], ['name' => 'Apollo']);
        $this->enableSchedule();

        $res = $this->request('POST', self::PATH, null, null, $this->auth());
        $reportId = $this->decode($res)['reportId'];

        // Retrievable via the authenticated archive read, marked scheduled, no triggerer.
        $get = $this->request('GET', '/reports/' . $reportId, null, $this->tokenFor($user));
        $this->assertSame(200, $get->getStatusCode());
        $report = $this->decode($get)['report'];
        $this->assertSame('scheduled', $report['type']);
        $this->assertNull($report['triggeredBy']);
    }

    public function testPersistedReportTypeIsScheduledInDb(): void
    {
        $_ENV['CRON_SECRET'] = self::SECRET;
        $user = $this->seedUser();
        $this->seedProject($user['id'], ['name' => 'Apollo']);
        $this->enableSchedule();

        $reportId = $this->decode($this->request('POST', self::PATH, null, null, $this->auth()))['reportId'];

        $stmt = $this->db->prepare('SELECT type, triggered_by FROM reports WHERE id = :id');
        $stmt->execute(['id' => $reportId]);
        $row = $stmt->fetch();
        $this->assertSame('scheduled', $row['type']);
        $this->assertNull($row['triggered_by']);
    }
}
