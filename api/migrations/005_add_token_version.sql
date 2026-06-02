-- JamWork v2 — Migration 005: users.token_version (session revocation, audit S3)
-- Idempotent + MySQL 8 compatible (no ADD COLUMN IF NOT EXISTS): guard on information_schema.
--
-- Applying this migration:
--   * Fresh installs — applied automatically by install.php (registered in its $migrations list).
--   * Existing installs — apply this file once before/with the deploy (the column is REQUIRED by
--     AuthMiddleware). Re-running is safe. Existing sessions are NOT logged out: pre-upgrade tokens
--     carry no version claim and are read as 0, matching the default; a user's sessions are
--     invalidated the first time they change/reset their password.
SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'token_version'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 0',
  'DO 0'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
