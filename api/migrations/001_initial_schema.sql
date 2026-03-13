-- JamWork v2 — Initial Schema Migration
-- Generated for MySQL 8.0
-- Run with: mysql -u root -p jamwork < 001_initial_schema.sql

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`                  CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `email`               VARCHAR(255) NOT NULL UNIQUE,
  `password_hash`       VARCHAR(255) NOT NULL,
  `display_name`        VARCHAR(255) NOT NULL,
  `role`                VARCHAR(50)  NOT NULL DEFAULT 'member',
  `must_reset_password` TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. workspace_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workspace_settings` (
  `id`         CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `key`        VARCHAR(255) NOT NULL UNIQUE,
  `value`      VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projects` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `name`          VARCHAR(255) NOT NULL,
  `description`   TEXT         DEFAULT NULL,
  `created_by_id` CHAR(36)     NOT NULL,
  `start_date`    TIMESTAMP    NULL DEFAULT NULL,
  `end_date`      TIMESTAMP    NULL DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX `idx_projects_created_by` (`created_by_id`),
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. sprints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sprints` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `name`          VARCHAR(255) NOT NULL,
  `description`   VARCHAR(500) DEFAULT NULL,
  `start_date`    TIMESTAMP    NOT NULL,
  `end_date`      TIMESTAMP    NOT NULL,
  `status`        VARCHAR(50)  NOT NULL DEFAULT 'active',
  `project_id`    CHAR(36)     DEFAULT NULL,
  `created_by_id` CHAR(36)     NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX `idx_sprints_project` (`project_id`),
  INDEX `idx_sprints_created_by` (`created_by_id`),
  FOREIGN KEY (`project_id`)    REFERENCES `projects`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. milestones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `milestones` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `name`          VARCHAR(255) NOT NULL,
  `date`          TIMESTAMP    NOT NULL,
  `project_id`    CHAR(36)     DEFAULT NULL,
  `created_by_id` CHAR(36)     NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX `idx_milestones_project` (`project_id`),
  INDEX `idx_milestones_created_by` (`created_by_id`),
  FOREIGN KEY (`project_id`)    REFERENCES `projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id`               CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `title`            VARCHAR(255) NOT NULL,
  `description`      TEXT         DEFAULT NULL,
  `notes`            TEXT         DEFAULT NULL,
  `status`           VARCHAR(50)  NOT NULL DEFAULT 'todo',
  `priority`         VARCHAR(50)  NOT NULL DEFAULT 'medium',
  `effort`           INT          DEFAULT NULL,
  `due_date`         TIMESTAMP    NULL DEFAULT NULL,
  `start_date`       TIMESTAMP    NULL DEFAULT NULL,
  `sort_order`       INT          NOT NULL DEFAULT 0,
  `recurrence`       VARCHAR(50)  DEFAULT NULL,
  `sprint_id`        CHAR(36)     DEFAULT NULL,
  `in_sprint_backlog` TINYINT(1)  NOT NULL DEFAULT 0,
  `project_id`       CHAR(36)     NOT NULL,
  `created_by_id`    CHAR(36)     NOT NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`       TIMESTAMP    NULL DEFAULT NULL,

  INDEX `idx_tasks_sprint` (`sprint_id`),
  INDEX `idx_tasks_project` (`project_id`),
  INDEX `idx_tasks_created_by` (`created_by_id`),
  INDEX `idx_tasks_deleted_at` (`deleted_at`),
  INDEX `idx_tasks_status` (`status`),
  INDEX `idx_tasks_priority` (`priority`),
  FOREIGN KEY (`sprint_id`)     REFERENCES `sprints`(`id`)  ON DELETE SET NULL,
  FOREIGN KEY (`project_id`)    REFERENCES `projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. subtasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subtasks` (
  `id`         CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `title`      VARCHAR(255) NOT NULL,
  `completed`  TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `task_id`    CHAR(36)     NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX `idx_subtasks_task` (`task_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. labels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `labels` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `name`          VARCHAR(255) NOT NULL,
  `color`         VARCHAR(50)  NOT NULL,
  `created_by_id` CHAR(36)     NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX `idx_labels_created_by` (`created_by_id`),
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. task_assignees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_assignees` (
  `id`          CHAR(36)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `task_id`     CHAR(36)  NOT NULL,
  `user_id`     CHAR(36)  NOT NULL,
  `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (`task_id`, `user_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. task_labels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_labels` (
  `id`       CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `task_id`  CHAR(36) NOT NULL,
  `label_id` CHAR(36) NOT NULL,

  UNIQUE (`task_id`, `label_id`),
  FOREIGN KEY (`task_id`)  REFERENCES `tasks`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. task_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_links` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `title`         VARCHAR(255) DEFAULT NULL,
  `url`           TEXT         NOT NULL,
  `task_id`       CHAR(36)     NOT NULL,
  `created_by_id` CHAR(36)     NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX `idx_task_links_task` (`task_id`),
  INDEX `idx_task_links_created_by` (`created_by_id`),
  FOREIGN KEY (`task_id`)       REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration complete: 11 tables
