BEGIN;

-- 2.1 Migrate coded menu role grants to sys_role_permission
INSERT INTO sys_role_permission (id, role_id, resource, actions, created_at)
SELECT
  gen_random_uuid(),
  rm.role_id,
  CASE m.code
    WHEN 'sys:users'    THEN 'platform:users'
    WHEN 'sys:roles'    THEN 'platform:roles'
    WHEN 'sys:orgs'     THEN 'platform:orgs'
    WHEN 'sys:config'   THEN 'platform:config'
    WHEN 'sys:designer' THEN 'designer:apps'
    WHEN 'sys:menus'    THEN 'designer:menus'
  END AS resource,
  rm.permissions AS actions,
  now()
FROM sys_role_menu rm
JOIN sys_menu m ON m.id = rm.menu_id
WHERE m.source = 'coded'
  AND m.code IN ('sys:users','sys:roles','sys:orgs','sys:config','sys:designer','sys:menus')
ON CONFLICT (role_id, resource) DO UPDATE
  SET actions = EXCLUDED.actions;

-- 2.2 Delete coded menus' role bindings + coded menus
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE source = 'coded');
DELETE FROM sys_menu WHERE source = 'coded';

-- 2.3 Delete orphaned designer menus (no app_id)
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE app_id IS NULL);
DELETE FROM sys_menu WHERE app_id IS NULL;

-- 2.4 Add constraints
ALTER TABLE sys_menu ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE sys_menu ADD CONSTRAINT sys_menu_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES sys_app(id) ON DELETE CASCADE;
ALTER TABLE sys_menu ADD CONSTRAINT sys_menu_target_model_id_fkey
  FOREIGN KEY (target_model_id) REFERENCES sys_model(id) ON DELETE RESTRICT;
ALTER TABLE sys_menu ADD CONSTRAINT sys_menu_target_view_id_fkey
  FOREIGN KEY (target_view_id) REFERENCES sys_view(id) ON DELETE RESTRICT;

-- 2.5 Drop old columns
ALTER TABLE sys_menu DROP COLUMN IF EXISTS source;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_route;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_app_code;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_model_code;
ALTER TABLE sys_menu DROP COLUMN IF EXISTS target_filter_preset;

-- 2.6 Unique constraint: global code -> (app_id, code)
ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS sys_menu_code_key;
DROP INDEX IF EXISTS sys_menu_code_key;  -- Prisma may create index separately from constraint
ALTER TABLE sys_menu ADD CONSTRAINT sys_menu_app_id_code_key UNIQUE (app_id, code);

-- 2.7 Drop old index
DROP INDEX IF EXISTS sys_menu_source_idx;

-- 2.8 SysRoleMenu: drop menu_code
ALTER TABLE sys_role_menu DROP COLUMN IF EXISTS menu_code;
DROP INDEX IF EXISTS sys_role_menu_menu_code_idx;

COMMIT;
