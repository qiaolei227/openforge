-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "sys_user" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "avatar" VARCHAR(500),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "parent_id" UUID,
    "status" "OrgStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_org" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sys_user_org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_config" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "value" TEXT,
    "default_val" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_app" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "icon" VARCHAR(50),
    "description" TEXT,
    "version" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_app_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_model" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "table_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "data_scope" VARCHAR(20) NOT NULL DEFAULT 'shared',
    "is_tree" BOOLEAN NOT NULL DEFAULT false,
    "semantic" TEXT,
    "ai_hint" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_entity" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "table_name" VARCHAR(200) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_field" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "entity_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "column_name" VARCHAR(100) NOT NULL,
    "field_type" VARCHAR(30) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_unique" BOOLEAN NOT NULL DEFAULT false,
    "default_value" JSONB,
    "options" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "semantic" TEXT,
    "ai_hint" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "deleted_column_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_view" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "layout" JSONB NOT NULL,
    "config" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sys_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_file" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" BIGINT NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_username_key" ON "sys_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sys_organization_code_key" ON "sys_organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_org_user_id_org_id_key" ON "sys_user_org"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "sys_config_code_key" ON "sys_config"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_app_code_key" ON "sys_app"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_model_app_id_code_key" ON "sys_model"("app_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_model_table_name_key" ON "sys_model"("table_name");

-- CreateIndex
CREATE UNIQUE INDEX "sys_entity_model_id_code_key" ON "sys_entity"("model_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_entity_table_name_key" ON "sys_entity"("table_name");

-- CreateIndex
CREATE UNIQUE INDEX "sys_field_model_id_column_name_key" ON "sys_field"("model_id", "column_name");

-- CreateIndex
CREATE INDEX "sys_file_org_id_idx" ON "sys_file"("org_id");

-- AddForeignKey
ALTER TABLE "sys_organization" ADD CONSTRAINT "sys_organization_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sys_organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_org" ADD CONSTRAINT "sys_user_org_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_org" ADD CONSTRAINT "sys_user_org_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "sys_organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_model" ADD CONSTRAINT "sys_model_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "sys_app"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_entity" ADD CONSTRAINT "sys_entity_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "sys_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_field" ADD CONSTRAINT "sys_field_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "sys_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_field" ADD CONSTRAINT "sys_field_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "sys_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_view" ADD CONSTRAINT "sys_view_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "sys_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
