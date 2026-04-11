-- P2.1 RBAC foundation migration
BEGIN;

-- sys_role
CREATE TABLE "sys_role" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"        VARCHAR(50)  NOT NULL,
  "name"        VARCHAR(100) NOT NULL,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "sys_role_code_key" ON "sys_role"("code");

-- sys_user_role
CREATE TABLE "sys_user_role" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL REFERENCES "sys_user"("id") ON DELETE CASCADE,
  "role_id"    UUID NOT NULL REFERENCES "sys_role"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "sys_user_role_user_id_role_id_key" ON "sys_user_role"("user_id", "role_id");
CREATE INDEX "sys_user_role_user_id_idx" ON "sys_user_role"("user_id");
CREATE INDEX "sys_user_role_role_id_idx" ON "sys_user_role"("role_id");

-- sys_menu
CREATE TABLE "sys_menu" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_id"            UUID REFERENCES "sys_menu"("id"),
  "code"                 VARCHAR(100) NOT NULL,
  "source"               VARCHAR(10)  NOT NULL,
  "type"                 VARCHAR(20)  NOT NULL,
  "name"                 VARCHAR(100) NOT NULL,
  "name_en"              VARCHAR(100),
  "icon"                 VARCHAR(50),
  "sort_order"           INT          NOT NULL DEFAULT 0,
  "visible"              BOOLEAN      NOT NULL DEFAULT true,
  "target_route"         VARCHAR(200),
  "target_app_code"      VARCHAR(50),
  "target_model_code"    VARCHAR(100),
  "target_view_id"       UUID,
  "target_filter_preset" JSONB,
  "target_url"           VARCHAR(500),
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "sys_menu_code_key" ON "sys_menu"("code");
CREATE INDEX "sys_menu_parent_id_idx" ON "sys_menu"("parent_id");
CREATE INDEX "sys_menu_source_idx" ON "sys_menu"("source");
CREATE INDEX "sys_menu_type_idx" ON "sys_menu"("type");

-- sys_role_menu
CREATE TABLE "sys_role_menu" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id"     UUID         NOT NULL REFERENCES "sys_role"("id") ON DELETE CASCADE,
  "menu_id"     UUID         NOT NULL REFERENCES "sys_menu"("id") ON DELETE CASCADE,
  "menu_code"   VARCHAR(100) NOT NULL,
  "permissions" TEXT[]       NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "sys_role_menu_role_id_menu_id_key" ON "sys_role_menu"("role_id", "menu_id");
CREATE INDEX "sys_role_menu_role_id_idx" ON "sys_role_menu"("role_id");
CREATE INDEX "sys_role_menu_menu_code_idx" ON "sys_role_menu"("menu_code");

-- sys_field_permission
CREATE TABLE "sys_field_permission" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id"    UUID         NOT NULL REFERENCES "sys_role"("id") ON DELETE CASCADE,
  "model_id"   UUID         NOT NULL REFERENCES "sys_model"("id") ON DELETE CASCADE,
  "field_id"   UUID         NOT NULL REFERENCES "sys_field"("id") ON DELETE CASCADE,
  "access"     VARCHAR(10)  NOT NULL CHECK ("access" IN ('hidden','readonly','editable')),
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "sys_field_permission_role_id_field_id_key" ON "sys_field_permission"("role_id", "field_id");
CREATE INDEX "sys_field_permission_role_id_idx" ON "sys_field_permission"("role_id");
CREATE INDEX "sys_field_permission_model_id_idx" ON "sys_field_permission"("model_id");
CREATE INDEX "sys_field_permission_field_id_idx" ON "sys_field_permission"("field_id");

COMMIT;
