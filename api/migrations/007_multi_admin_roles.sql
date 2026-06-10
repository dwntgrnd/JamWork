-- JamWork v2 — Migration 007: Multi-Admin Role Model (CC31a)
-- Introduces the three-tier role model: owner / admin / member.
--
-- Before this migration, `role` was VARCHAR(50) NOT NULL DEFAULT 'member'
-- (migration 001) — NOT a pre-existing ENUM. This migration constrains the
-- column to the three valid roles, which reinforces the owner invariant
-- (exactly one owner per workspace) at the database level. Existing 'admin'
-- and 'member' values remain valid under the new ENUM.
--
-- Applying this migration:
--   * Fresh installs — replayed automatically by the test harness and install.php.
--   * Existing installs — apply this file ONCE, in order, before/with the deploy.
--
-- PRODUCTION POST-DEPLOY MANUAL STEP (NOT automated here):
-- Step 2 promotes the current sole admin to owner, but that user is not
-- necessarily the intended owner. After this migration runs, swap roles in
-- phpMyAdmin so the intended owner holds the role:
--   UPDATE users SET role = 'admin' WHERE role = 'owner';
--   UPDATE users SET role = 'owner' WHERE email = '{intended-owner-email}';
--
-- Rollback (after manually ensuring no rows have role = 'owner'):
--   ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'member';

-- Step 1: Constrain role to the three valid values.
ALTER TABLE users MODIFY COLUMN role ENUM('owner','admin','member') NOT NULL DEFAULT 'member';

-- Step 2: Promote the existing sole admin to owner.
UPDATE users SET role = 'owner' WHERE role = 'admin';
