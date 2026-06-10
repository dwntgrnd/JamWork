<?php

namespace JamWork\Services;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Decides whether a weekly report schedule is due to fire at a given instant
 * (CC32a). The cron endpoint is polled hourly, so this is the gate that makes
 * polling safe: it returns true at most once per scheduled occurrence.
 *
 * Everything is UTC (Decision #102) — no timezone conversion. "Due" means:
 *   - the master toggle is enabled, AND
 *   - today's ISO weekday matches day_of_week (1=Mon … 7=Sun), AND
 *   - now is at/after today's send_time_utc, AND
 *   - it has not already been sent on/after today's occurrence (dedup).
 */
final class ScheduleEvaluator
{
    public static function isDue(array $schedule, DateTimeImmutable $nowUtc): bool
    {
        if ((int) ($schedule['enabled'] ?? 0) !== 1) {
            return false;
        }

        if ((int) $nowUtc->format('N') !== (int) $schedule['day_of_week']) {
            return false;
        }

        $occurrence = self::todaysOccurrence($schedule, $nowUtc);
        if ($nowUtc < $occurrence) {
            return false;
        }

        $lastSent = $schedule['last_sent_at'] ?? null;
        if ($lastSent !== null && $lastSent !== '') {
            $last = new DateTimeImmutable((string) $lastSent, new DateTimeZone('UTC'));
            if ($last >= $occurrence) {
                return false;
            }
        }

        return true;
    }

    /** The scheduled send instant on $nowUtc's calendar date (UTC). */
    private static function todaysOccurrence(array $schedule, DateTimeImmutable $nowUtc): DateTimeImmutable
    {
        $sendTime = substr((string) $schedule['send_time_utc'], 0, 8); // "HH:MM:SS"
        return new DateTimeImmutable($nowUtc->format('Y-m-d') . ' ' . $sendTime, new DateTimeZone('UTC'));
    }
}
