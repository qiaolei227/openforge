-- Rollback for p2_1_rbac_foundation.sql
-- Drops all 5 P2.1 RBAC tables in reverse dependency order.
-- Usage: cat p2_1_rbac_foundation.rollback.sql | pnpm --filter server exec prisma db execute --stdin
BEGIN;
DROP TABLE IF EXISTS "sys_field_permission" CASCADE;
DROP TABLE IF EXISTS "sys_role_menu" CASCADE;
DROP TABLE IF EXISTS "sys_menu" CASCADE;
DROP TABLE IF EXISTS "sys_user_role" CASCADE;
DROP TABLE IF EXISTS "sys_role" CASCADE;
COMMIT;
