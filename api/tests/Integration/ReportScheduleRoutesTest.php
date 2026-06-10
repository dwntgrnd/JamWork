<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Admin-gated schedule + recipient endpoints (CC32a, Phase 2). Exercises the
 * singleton upsert, the UTC-only validation contract (422 on bad day/time), the
 * LEFT-JOIN recipient listing with implicit-enabled defaulting, and the
 * owner/admin/member access boundary.
 */
final class ReportScheduleRoutesTest extends IntegrationTestCase
{
    private array $admin;
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->seedUser(['role' => 'admin', 'display_name' => 'Admin']);
        $this->adminToken = $this->tokenFor($this->admin);
    }

    // --- GET /admin/report-schedule ----------------------------------------

    public function testScheduleGetReturnsDefaultsWhenNoRowExists(): void
    {
        $res = $this->request('GET', '/admin/report-schedule', null, $this->adminToken);
        $this->assertSame(200, $res->getStatusCode());

        $this->assertSame([
            'enabled' => false,
            'dayOfWeek' => 1,
            'sendTimeUtc' => '09:00',
            'frequency' => 'weekly',
        ], $this->decode($res));
    }

    // --- PUT /admin/report-schedule ----------------------------------------

    public function testSchedulePutCreatesThenGetReturnsSavedValues(): void
    {
        $body = ['enabled' => true, 'dayOfWeek' => 4, 'sendTimeUtc' => '14:30', 'frequency' => 'weekly'];

        $put = $this->request('PUT', '/admin/report-schedule', $body, $this->adminToken);
        $this->assertSame(200, $put->getStatusCode());
        $this->assertSame($body, $this->decode($put));

        $get = $this->request('GET', '/admin/report-schedule', null, $this->adminToken);
        $this->assertSame($body, $this->decode($get));
    }

    public function testSchedulePutUpsertsSingleRow(): void
    {
        $this->request('PUT', '/admin/report-schedule', [
            'enabled' => true, 'dayOfWeek' => 2, 'sendTimeUtc' => '08:00', 'frequency' => 'weekly',
        ], $this->adminToken);
        $this->request('PUT', '/admin/report-schedule', [
            'enabled' => false, 'dayOfWeek' => 7, 'sendTimeUtc' => '23:00', 'frequency' => 'weekly',
        ], $this->adminToken);

        $count = $this->db->query('SELECT COUNT(*) FROM report_schedule')->fetchColumn();
        $this->assertSame(1, (int) $count);

        $get = $this->decode($this->request('GET', '/admin/report-schedule', null, $this->adminToken));
        $this->assertSame(7, $get['dayOfWeek']);
        $this->assertSame('23:00', $get['sendTimeUtc']);
        $this->assertFalse($get['enabled']);
    }

    public function testSchedulePutRejectsDayOfWeekBelowRange(): void
    {
        $res = $this->request('PUT', '/admin/report-schedule', [
            'enabled' => true, 'dayOfWeek' => 0, 'sendTimeUtc' => '09:00', 'frequency' => 'weekly',
        ], $this->adminToken);
        $this->assertSame(422, $res->getStatusCode());
    }

    public function testSchedulePutRejectsDayOfWeekAboveRange(): void
    {
        $res = $this->request('PUT', '/admin/report-schedule', [
            'enabled' => true, 'dayOfWeek' => 8, 'sendTimeUtc' => '09:00', 'frequency' => 'weekly',
        ], $this->adminToken);
        $this->assertSame(422, $res->getStatusCode());
    }

    public function testSchedulePutRejectsMalformedSendTime(): void
    {
        foreach (['9:00', '24:00', '14:60', 'morning', '14.30'] as $bad) {
            $res = $this->request('PUT', '/admin/report-schedule', [
                'enabled' => true, 'dayOfWeek' => 1, 'sendTimeUtc' => $bad, 'frequency' => 'weekly',
            ], $this->adminToken);
            $this->assertSame(422, $res->getStatusCode(), "expected 422 for sendTimeUtc={$bad}");
        }
    }

    public function testSchedulePutRejectsBadFrequency(): void
    {
        $res = $this->request('PUT', '/admin/report-schedule', [
            'enabled' => true, 'dayOfWeek' => 1, 'sendTimeUtc' => '09:00', 'frequency' => 'daily',
        ], $this->adminToken);
        $this->assertSame(422, $res->getStatusCode());
    }

    // --- GET /admin/report-recipients --------------------------------------

    public function testRecipientsGetReturnsAllUsersWithStatus(): void
    {
        $bob = $this->seedUser(['display_name' => 'Bob', 'email' => 'bob@example.com']);
        $ann = $this->seedUser(['display_name' => 'Ann', 'email' => 'ann@example.com']);

        $res = $this->request('GET', '/admin/report-recipients', null, $this->adminToken);
        $this->assertSame(200, $res->getStatusCode());
        $recipients = $this->decode($res)['recipients'];

        // Three users total (admin + bob + ann), ordered by display_name ASC.
        $names = array_column($recipients, 'displayName');
        $this->assertSame(['Admin', 'Ann', 'Bob'], $names);

        // Users with no recipient row default to enabled = true.
        foreach ($recipients as $r) {
            $this->assertArrayHasKey('userId', $r);
            $this->assertArrayHasKey('email', $r);
            $this->assertTrue($r['enabled']);
        }
        $this->assertContains($bob['id'], array_column($recipients, 'userId'));
        $this->assertContains($ann['id'], array_column($recipients, 'userId'));
    }

    // --- PUT /admin/report-recipients/{userId} -----------------------------

    public function testRecipientsPutTogglesUserOffThenOn(): void
    {
        $bob = $this->seedUser(['display_name' => 'Bob', 'email' => 'bob@example.com']);

        $off = $this->request('PUT', '/admin/report-recipients/' . $bob['id'], ['enabled' => false], $this->adminToken);
        $this->assertSame(200, $off->getStatusCode());
        $this->assertSame(['userId' => $bob['id'], 'enabled' => false], $this->decode($off));

        $statusOff = $this->recipientEnabled($bob['id']);
        $this->assertFalse($statusOff);

        $on = $this->request('PUT', '/admin/report-recipients/' . $bob['id'], ['enabled' => true], $this->adminToken);
        $this->assertSame(['userId' => $bob['id'], 'enabled' => true], $this->decode($on));
        $this->assertTrue($this->recipientEnabled($bob['id']));

        // Upsert leaves exactly one row for the user.
        $count = $this->db->prepare('SELECT COUNT(*) FROM report_recipients WHERE user_id = :id');
        $count->execute(['id' => $bob['id']]);
        $this->assertSame(1, (int) $count->fetchColumn());
    }

    public function testRecipientsPutForNonexistentUserReturns404(): void
    {
        $res = $this->request('PUT', '/admin/report-recipients/' . Uuid::uuid4()->toString(), ['enabled' => false], $this->adminToken);
        $this->assertSame(404, $res->getStatusCode());
    }

    public function testRecipientsPutRejectsInvalidUuid(): void
    {
        $res = $this->request('PUT', '/admin/report-recipients/not-a-uuid', ['enabled' => false], $this->adminToken);
        $this->assertSame(400, $res->getStatusCode());
    }

    // --- Access boundary ----------------------------------------------------

    public function testMemberCannotAccessAnyEndpoint(): void
    {
        $member = $this->seedUser(['role' => 'member', 'display_name' => 'Member']);
        $token = $this->tokenFor($member);

        $cases = [
            ['GET', '/admin/report-schedule', null],
            ['PUT', '/admin/report-schedule', ['enabled' => true, 'dayOfWeek' => 1, 'sendTimeUtc' => '09:00', 'frequency' => 'weekly']],
            ['GET', '/admin/report-recipients', null],
            ['PUT', '/admin/report-recipients/' . $member['id'], ['enabled' => false]],
        ];
        foreach ($cases as [$method, $path, $body]) {
            $res = $this->request($method, $path, $body, $token);
            $this->assertSame(403, $res->getStatusCode(), "expected 403 for {$method} {$path}");
        }
    }

    private function recipientEnabled(string $userId): ?bool
    {
        $stmt = $this->db->prepare('SELECT enabled FROM report_recipients WHERE user_id = :id');
        $stmt->execute(['id' => $userId]);
        $val = $stmt->fetchColumn();
        return $val === false ? null : (bool) (int) $val;
    }
}
