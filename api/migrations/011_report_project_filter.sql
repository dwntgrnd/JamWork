-- JamWork v2 — Migration 011: ad hoc report project selection (CC36)
-- Filter metadata for manually-scoped status reports. When a user generates a
-- report for a subset of report-eligible projects (via the project picker),
-- these columns record the scope so the archive list can render a
-- "Filtered (N of M projects)" badge without re-parsing payload_json.
--
--   * is_filtered             — 1 when the report was scoped to a project subset.
--   * included_project_count  — N: how many projects were included (NULL = full).
--   * eligible_project_count  — M: total report-eligible projects at generation.
--
-- Full reports (the one-click default) and scheduled cron reports leave all
-- three at their defaults (is_filtered = 0, counts NULL), so every existing row
-- and every unscoped report renders exactly as before — no badge.
--
-- Additive, backward-compatible (INSTANT/metadata-only on MySQL 8.0.12+).
ALTER TABLE `reports`
  ADD COLUMN `is_filtered`            TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `included_project_count` INT        NULL DEFAULT NULL,
  ADD COLUMN `eligible_project_count` INT        NULL DEFAULT NULL;
