BEGIN;

-- 1.1 SysApp
ALTER TABLE sys_app ADD COLUMN theme_color VARCHAR(20);
ALTER TABLE sys_app ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

-- 1.2 SysMenu
ALTER TABLE sys_menu ADD COLUMN app_id UUID;
ALTER TABLE sys_menu ADD COLUMN target_model_id UUID;
ALTER TABLE sys_menu ADD COLUMN target_view_type VARCHAR(20);
CREATE INDEX sys_menu_app_id_idx ON sys_menu(app_id);

-- 1.3 sys_role_permission
CREATE TABLE sys_role_permission (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     UUID NOT NULL REFERENCES sys_role(id) ON DELETE CASCADE,
  resource    VARCHAR(100) NOT NULL,
  actions     TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, resource)
);
CREATE INDEX sys_role_permission_role_id_idx ON sys_role_permission(role_id);

-- 1.4 Backfill designer type=model menus
UPDATE sys_menu m
SET app_id = sa.id, target_model_id = sm.id, target_view_type = 'list'
FROM sys_app sa
JOIN sys_model sm ON sm.app_id = sa.id
WHERE m.source = 'designer' AND m.type = 'model'
  AND sa.code = m.target_app_code AND sm.code = m.target_model_code;

-- 1.5 Recursive backfill group/link/divider app_id from parent
WITH RECURSIVE menu_app AS (
  SELECT id, app_id FROM sys_menu WHERE source = 'designer' AND app_id IS NOT NULL
  UNION
  SELECT m.id, ma.app_id FROM sys_menu m JOIN menu_app ma ON m.parent_id = ma.id
  WHERE m.source = 'designer' AND m.app_id IS NULL
)
UPDATE sys_menu m SET app_id = ma.app_id FROM menu_app ma WHERE m.id = ma.id AND m.app_id IS NULL;

COMMIT;
