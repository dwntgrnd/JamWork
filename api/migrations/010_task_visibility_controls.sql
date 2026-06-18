-- JamWork v2 — Migration 010: per-task visibility controls (CC34)
-- Two independent opt-out toggles that govern where a task surfaces outside the
-- core list/board views:
--   * show_on_timeline  — when 0, the task is hidden from the timeline view even
--                         if it still has start/due dates (filtered client-side).
--   * include_in_report — when 0, the task is excluded from generated status
--                         reports (filtered server-side in ReportService::fetchTasks).
--
-- Default 1 for both, so every existing task keeps appearing everywhere — zero
-- behavior change on apply.
--
-- Applying this migration:
--   * Fresh installs — replayed automatically by the test harness and install.php.
--   * Existing installs — apply this file ONCE, in order, before/with the deploy.
--     Additive, backward-compatible (INSTANT/metadata-only on MySQL 8.0.12+).
ALTER TABLE `tasks`
  ADD COLUMN `show_on_timeline` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `include_in_report` TINYINT(1) NOT NULL DEFAULT 1;
