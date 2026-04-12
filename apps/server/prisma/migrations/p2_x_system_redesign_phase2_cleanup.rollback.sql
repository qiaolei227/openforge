-- Rollback requires pg_dump restore for deleted data (coded menus, role grants).
-- This script only reverses schema changes.

BEGIN;
ALTER TABLE sys_role_menu ADD COLUMN menu_code VARCHAR(100) NOT NULL DEFAULT '';
CREATE INDEX sys_role_menu_menu_code_idx ON sys_role_menu(menu_code);

ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS sys_menu_app_id_code_key;
ALTER TABLE sys_menu ADD CONSTRAINT sys_menu_code_key UNIQUE (code);

ALTER TABLE sys_menu ADD COLUMN target_filter_preset JSONB;
ALTER TABLE sys_menu ADD COLUMN target_model_code VARCHAR(100);
ALTER TABLE sys_menu ADD COLUMN target_app_code VARCHAR(50);
ALTER TABLE sys_menu ADD COLUMN target_route VARCHAR(200);
ALTER TABLE sys_menu ADD COLUMN source VARCHAR(10);

ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS sys_menu_target_view_id_fkey;
ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS sys_menu_target_model_id_fkey;
ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS sys_menu_app_id_fkey;
ALTER TABLE sys_menu ALTER COLUMN app_id DROP NOT NULL;

CREATE INDEX sys_menu_source_idx ON sys_menu(source);
COMMIT;
