<?php

namespace Tests\Integration;

use JamWork\Bootstrap;

/**
 * Code-review #1: the Done-window and overdue math compares PHP clocks
 * (time()/strtotime()) against MySQL-written datetimes (NOW(), completed_at).
 * That is only correct if PHP and the MySQL session share a timezone, so we
 * pin BOTH to UTC. These tests lock that in (tests/bootstrap.php pinning PHP
 * is not enough — production must be pinned too).
 */
final class TimezoneConsistencyTest extends IntegrationTestCase
{
    public function testDatabaseSessionTimezoneIsPinnedToUtc(): void
    {
        $tz = $this->db->query('SELECT @@session.time_zone')->fetchColumn();
        $this->assertSame('+00:00', $tz, 'DB session must be UTC so NOW()/completed_at are UTC');
    }

    public function testCreateAppPinsPhpTimezoneToUtc(): void
    {
        $original = date_default_timezone_get();
        try {
            date_default_timezone_set('America/New_York');
            Bootstrap::createApp();
            $this->assertSame('UTC', date_default_timezone_get(), 'createApp must pin PHP to UTC');
        } finally {
            date_default_timezone_set($original);
        }
    }
}
