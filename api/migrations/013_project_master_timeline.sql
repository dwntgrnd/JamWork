-- 013_project_master_timeline.sql
-- Per-project "include in master timeline" flag. Default ON preserves existing
-- behavior: every project appears in the all-projects Timeline view. When OFF,
-- the project is hidden from that master view only — its own Timeline tab is
-- unaffected. Mirrors `include_in_status_report` (migration 006) and
-- `sprint_planning` (migration 003).

ALTER TABLE `projects`
  ADD COLUMN `include_in_master_timeline` TINYINT(1) NOT NULL DEFAULT 1;
