-- JamWork v2 — Migration 012: users.preferences (per-user settings store, CC37)
-- Idempotent + MySQL 8 compatible (no ADD COLUMN IF NOT EXISTS): guard on information_schema.
--
-- A generic JSON column for per-user preferences with top-level namespaced keys
-- (e.g. "sidebar"). CC37 stores { "sidebar": { "view": "all"|"mine",
-- "pinnedProjects": ["<uuid>", ...] } }. Future per-user settings add sibling
-- top-level keys without another migration. NULL = no preferences set yet; the
-- API reads that as {} so the client never has to handle null.
--
-- Applying this migration:
--   * Fresh installs — applied automatically by install.php (registered in its $migrations list).
--   * Existing installs — apply this file once before/with the deploy. Re-running is safe;
--     existing rows are unaffected (column defaults to NULL).
SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'preferences'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `preferences` JSON DEFAULT NULL',
  'DO 0'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
