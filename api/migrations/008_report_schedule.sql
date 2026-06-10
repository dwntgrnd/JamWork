-- JamWork v2 — Migration 008: Scheduled Report Delivery (CC32a)
-- Adds the two tables that back scheduled, emailed status reports:
--   * report_schedule   — a singleton config row (one schedule per workspace).
--   * report_recipients — per-user opt-in for the scheduled email (admin-managed).
--
-- Both are UTC-only and admin-managed (Decisions #102/#103). The schedule is a
-- singleton enforced in application logic (PUT upserts); the id column exists for
-- convention. report_recipients cascades on user delete so no orphan rows remain.
--
-- Applying this migration:
--   * Fresh installs — replayed automatically by the test harness and install.php.
--   * Existing installs — apply this file ONCE, in order, before/with the deploy.
--
-- Rollback (manual; keep COMMENTED — the harness replays this file):
--   DROP TABLE IF EXISTS `report_recipients`;
--   DROP TABLE IF EXISTS `report_schedule`;
SET NAMES utf8mb4;

-- Singleton schedule config. enabled is the master toggle (Decision #104): when
-- 0 the cron endpoint runs but sends nothing, preserving the rest of the config.
CREATE TABLE IF NOT EXISTS `report_schedule` (
  `id`            CHAR(36)         NOT NULL PRIMARY KEY,
  `enabled`       TINYINT(1)       NOT NULL DEFAULT 0,
  `day_of_week`   TINYINT          NOT NULL DEFAULT 1 COMMENT '1=Monday, 7=Sunday (ISO 8601)',
  `send_time_utc` TIME             NOT NULL DEFAULT '09:00:00',
  `frequency`     ENUM('weekly')   NOT NULL DEFAULT 'weekly',
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user recipient opt-in. enabled defaults to 1 (all members in by default);
-- ON DELETE CASCADE removes the row when the user is deleted.
CREATE TABLE IF NOT EXISTS `report_recipients` (
  `id`         CHAR(36)   NOT NULL PRIMARY KEY,
  `user_id`    CHAR(36)   NOT NULL,
  `enabled`    TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT `fk_report_recipients_user` FOREIGN KEY (`user_id`)
    REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed every existing user as an enabled recipient so the list starts fully
-- populated without requiring each user to be re-invited.
INSERT INTO `report_recipients` (`id`, `user_id`, `enabled`)
SELECT UUID(), `id`, 1 FROM `users`;
