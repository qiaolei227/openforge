-- Phase 1: additive changes for P2.3 approval workflow
-- 6 new tables, no destructive changes

-- 1. sys_workflow
CREATE TABLE IF NOT EXISTS public.sys_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.sys_model(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  condition JSONB,
  current_version_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sys_workflow_current_version_unique
  ON public.sys_workflow (current_version_id)
  WHERE current_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sys_workflow_model_enabled_sort_idx
  ON public.sys_workflow (model_id, enabled, sort_order);

-- 2. sys_workflow_version
CREATE TABLE IF NOT EXISTS public.sys_workflow_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.sys_workflow(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  definition JSONB NOT NULL,
  published_by UUID NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version_no)
);

-- FK from sys_workflow.current_version_id to sys_workflow_version.id
ALTER TABLE public.sys_workflow
  ADD CONSTRAINT sys_workflow_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.sys_workflow_version(id) ON DELETE SET NULL;

-- 3. sys_workflow_instance
CREATE TABLE IF NOT EXISTS public.sys_workflow_instance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.sys_workflow(id),
  version_id UUID NOT NULL REFERENCES public.sys_workflow_version(id),
  model_id UUID NOT NULL,
  app_id UUID NOT NULL,
  record_id UUID NOT NULL,
  org_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  active_node_ids TEXT[] NOT NULL DEFAULT '{}',
  started_by UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  final_snapshot JSONB,
  ai_summary TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sys_workflow_instance_record_idx
  ON public.sys_workflow_instance (record_id);
CREATE INDEX IF NOT EXISTS sys_workflow_instance_model_status_idx
  ON public.sys_workflow_instance (model_id, status);
CREATE INDEX IF NOT EXISTS sys_workflow_instance_started_by_status_idx
  ON public.sys_workflow_instance (started_by, status, started_at);

-- 4. sys_workflow_task
CREATE TABLE IF NOT EXISTS public.sys_workflow_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.sys_workflow_instance(id) ON DELETE CASCADE,
  node_id VARCHAR(64) NOT NULL,
  node_name VARCHAR(128) NOT NULL,
  node_type VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  assignee_user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  decision_at TIMESTAMPTZ,
  comment TEXT,
  snapshot JSONB,
  parent_task_id UUID,
  added_by_user_id UUID,
  added_position VARCHAR(10),
  transferred_from_user_id UUID,
  due_at TIMESTAMPTZ,
  escalated BOOLEAN NOT NULL DEFAULT false,
  urged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sys_workflow_task_assignee_status_idx
  ON public.sys_workflow_task (assignee_user_id, status);
CREATE INDEX IF NOT EXISTS sys_workflow_task_instance_node_status_idx
  ON public.sys_workflow_task (instance_id, node_id, status);
CREATE INDEX IF NOT EXISTS sys_workflow_task_due_escalated_idx
  ON public.sys_workflow_task (due_at, escalated, status);

-- 5. sys_workflow_log
CREATE TABLE IF NOT EXISTS public.sys_workflow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.sys_workflow_instance(id) ON DELETE CASCADE,
  task_id UUID,
  action VARCHAR(30) NOT NULL,
  node_id VARCHAR(64),
  operator_user_id UUID,
  target_user_id UUID,
  comment TEXT,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sys_workflow_log_instance_time_idx
  ON public.sys_workflow_log (instance_id, created_at);

-- 6. sys_notification
CREATE TABLE IF NOT EXISTS public.sys_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(256) NOT NULL,
  body VARCHAR(1024),
  related_type VARCHAR(40),
  related_id UUID,
  navigate_to VARCHAR(512),
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sys_notification_user_read_time_idx
  ON public.sys_notification (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS sys_notification_user_type_time_idx
  ON public.sys_notification (user_id, type, created_at DESC);
