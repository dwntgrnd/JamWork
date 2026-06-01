-- 004_notification_preferences.sql
-- Task notification preferences: three independent control layers (PRD 2026-06-01).
--   users.notify_*           — per-user, per-event receiver-side toggles
--   tasks.notify_enabled     — task-wide flag (silences a task for everyone)
--   projects.default_notify_enabled — seeds a new task's flag at creation
--
-- All columns DEFAULT 1 so the existing "Assigned" email path is preserved and NEW users
-- get the full all-ON experience. The two genuinely-new events (Unassigned / Changed) are
-- backfilled OFF for the EXISTING user population so the deploy introduces no email type
-- they've never seen — current users keep today's behavior exactly and opt in via Settings.

ALTER TABLE `users`
  ADD COLUMN `notify_assigned`   TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_unassigned` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_changed`    TINYINT(1) NOT NULL DEFAULT 1;

-- Opt-in backfill for the new events (existing users only; new rows keep DEFAULT 1).
UPDATE `users` SET `notify_unassigned` = 0, `notify_changed` = 0;

ALTER TABLE `tasks`
  ADD COLUMN `notify_enabled` TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE `projects`
  ADD COLUMN `default_notify_enabled` TINYINT(1) NOT NULL DEFAULT 1;
