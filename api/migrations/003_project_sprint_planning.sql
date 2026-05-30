-- 003_project_sprint_planning.sql
-- Per-project "part of sprint planning" flag. Default ON preserves existing behavior:
-- projects show sprint background bands on their timeline and their sprint-less tasks
-- appear in the global backlog. When OFF, both are suppressed for that project.

ALTER TABLE `projects`
  ADD COLUMN `sprint_planning` TINYINT(1) NOT NULL DEFAULT 1;
