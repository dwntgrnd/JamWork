-- JamWork v2 — Migration 006: Status Report feature (CC30a, backend data layer)
-- Adds the `reports` snapshot table, the per-project `include_in_status_report`
-- inclusion flag (default ON, mirroring `sprint_planning` from migration 003),
-- and the `tasks.completed_at` timestamp that backs the Done 7-day window.
--
-- Applying this migration:
--   * Fresh installs — replayed automatically by the test harness and install.php.
--   * Existing installs — apply this file ONCE, in order, before/with the deploy.
--     Apply with a database backup (touches the live `projects` and `tasks` tables).
--   * Forward-only: the harness replays every migrations/*.sql, so the rollback
--     statements at the bottom are intentionally left COMMENTED. Run them by hand
--     only when deliberately reverting.
SET NAMES utf8mb4;

-- Stored report snapshots: payload_json drives the in-app render, markdown the
-- download. idx_reports_generated_at backs the newest-first archive sort.
CREATE TABLE IF NOT EXISTS `reports` (
  `id`           CHAR(36)   NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `generated_at` TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `type`         ENUM('scheduled','ad_hoc') NOT NULL,
  `triggered_by` CHAR(36)   NULL,
  `window_days`  INT        NOT NULL DEFAULT 7,
  `payload_json` JSON       NOT NULL,
  `markdown`     MEDIUMTEXT NOT NULL,

  INDEX `idx_reports_generated_at` (`generated_at`),
  CONSTRAINT `fk_reports_user` FOREIGN KEY (`triggered_by`)
    REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-project inclusion flag. Default 1 → every existing project is included.
ALTER TABLE `projects`
  ADD COLUMN `include_in_status_report` TINYINT(1) NOT NULL DEFAULT 1;

-- Completion timestamp for the Done window. Set when a task transitions TO
-- 'done', cleared when it leaves 'done' (TaskService write path). updated_at is
-- explicitly NOT a proxy — it changes on any edit.
ALTER TABLE `tasks`
  ADD COLUMN `completed_at` TIMESTAMP NULL DEFAULT NULL;

-- One-time, approximate backfill so the first reports aren't empty: seed
-- completed_at from updated_at for already-done tasks. Only an estimate of when
-- the task became done; forward population is exact. Idempotent via the guard.
UPDATE `tasks` SET `completed_at` = `updated_at`
  WHERE `status` = 'done' AND `completed_at` IS NULL;

-- ROLLBACK (manual; keep COMMENTED — the harness replays this file):
-- DROP TABLE IF EXISTS `reports`;
-- ALTER TABLE `projects` DROP COLUMN `include_in_status_report`;
-- ALTER TABLE `tasks` DROP COLUMN `completed_at`;
