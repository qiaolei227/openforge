BEGIN;
DROP TABLE IF EXISTS sys_role_permission;
DROP INDEX IF EXISTS sys_menu_app_id_idx;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_view_type;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_model_id;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS app_id;
ALTER TABLE sys_app DROP COLUMN IF EXISTS sort_order;
ALTER TABLE sys_app DROP COLUMN IF EXISTS theme_color;
COMMIT;
