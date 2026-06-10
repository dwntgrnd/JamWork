-- JamWork v2 — Migration 009: scheduled-report send tracking (CC32a fix)
-- The cron endpoint is polled hourly; without a record of the last send it
-- re-generates and re-emails on EVERY poll once the schedule is enabled. This
-- column records when the schedule last fired so the endpoint sends at most
-- once per weekly occurrence (see JamWork\Services\ScheduleEvaluator::isDue).
--
-- DATETIME (not TIMESTAMP) and written/read as explicit UTC, so there is no
-- session-timezone conversion — the stored value means exactly that UTC instant.
--
-- Applying this migration:
--   * Fresh installs — replayed automatically by the test harness and install.php.
--   * Existing installs — apply this file ONCE, in order, before/with the deploy.
--     Additive, backward-compatible (INSTANT/metadata-only on MySQL 8.0.12+).
ALTER TABLE `report_schedule`
  ADD COLUMN `last_sent_at` DATETIME NULL DEFAULT NULL;
