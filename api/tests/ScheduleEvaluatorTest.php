<?php

namespace Tests;

use DateTimeImmutable;
use DateTimeZone;
use JamWork\Services\ScheduleEvaluator;
use PHPUnit\Framework\TestCase;

/**
 * Pure-logic tests for the weekly schedule "is it due right now?" decision
 * (CC32a fix). The cron endpoint runs hourly, so this gate is what stops it
 * from re-generating + re-emailing on every call. UTC throughout — no timezone
 * conversion. No DB, no network.
 *
 * A schedule is due iff: enabled, today's ISO weekday == day_of_week,
 * now >= today's send_time_utc, and it has not already been sent on/after
 * today's scheduled occurrence (the dedup that makes hourly polling safe).
 */
final class ScheduleEvaluatorTest extends TestCase
{
    /** 2026-06-10 is a Wednesday (ISO weekday 3). */
    private function now(string $utc): DateTimeImmutable
    {
        return new DateTimeImmutable($utc, new DateTimeZone('UTC'));
    }

    private function schedule(array $overrides = []): array
    {
        return array_merge([
            'enabled' => 1,
            'day_of_week' => 3,           // Wednesday
            'send_time_utc' => '09:00:00',
            'frequency' => 'weekly',
            'last_sent_at' => null,
        ], $overrides);
    }

    public function testDueWhenEnabledMatchingDayAfterSendTimeNeverSent(): void
    {
        $this->assertTrue(
            ScheduleEvaluator::isDue($this->schedule(), $this->now('2026-06-10 10:00:00'))
        );
    }

    public function testDueExactlyAtSendTime(): void
    {
        $this->assertTrue(
            ScheduleEvaluator::isDue($this->schedule(), $this->now('2026-06-10 09:00:00'))
        );
    }

    public function testNotDueWhenDisabled(): void
    {
        $this->assertFalse(
            ScheduleEvaluator::isDue($this->schedule(['enabled' => 0]), $this->now('2026-06-10 10:00:00'))
        );
    }

    public function testNotDueOnWrongWeekday(): void
    {
        // now is Wednesday (3); schedule says Thursday (4).
        $this->assertFalse(
            ScheduleEvaluator::isDue($this->schedule(['day_of_week' => 4]), $this->now('2026-06-10 10:00:00'))
        );
    }

    public function testNotDueBeforeSendTime(): void
    {
        $this->assertFalse(
            ScheduleEvaluator::isDue($this->schedule(), $this->now('2026-06-10 08:59:59'))
        );
    }

    public function testNotDueWhenAlreadySentThisOccurrence(): void
    {
        // Sent earlier today, after the 09:00 occurrence — the hourly re-poll must skip.
        $this->assertFalse(
            ScheduleEvaluator::isDue(
                $this->schedule(['last_sent_at' => '2026-06-10 09:30:00']),
                $this->now('2026-06-10 10:00:00')
            )
        );
    }

    public function testDueWhenLastSentWasAPriorOccurrence(): void
    {
        // Last send was last Wednesday — this week's occurrence is fresh.
        $this->assertTrue(
            ScheduleEvaluator::isDue(
                $this->schedule(['last_sent_at' => '2026-06-03 09:05:00']),
                $this->now('2026-06-10 10:00:00')
            )
        );
    }
}
