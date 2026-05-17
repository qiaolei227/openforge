-- Rollback Phase 1 additive
ALTER TABLE public.sys_workflow DROP CONSTRAINT IF EXISTS sys_workflow_current_version_fk;
DROP TABLE IF EXISTS public.sys_notification CASCADE;
DROP TABLE IF EXISTS public.sys_workflow_log CASCADE;
DROP TABLE IF EXISTS public.sys_workflow_task CASCADE;
DROP TABLE IF EXISTS public.sys_workflow_instance CASCADE;
DROP TABLE IF EXISTS public.sys_workflow_version CASCADE;
DROP TABLE IF EXISTS public.sys_workflow CASCADE;
