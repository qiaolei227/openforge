BEGIN;

-- Rollback Phase 1

DROP INDEX IF EXISTS public.idx_sys_distribution_log_operator;
DROP INDEX IF EXISTS public.idx_sys_distribution_log_model_record;
DROP TABLE IF EXISTS public.sys_distribution_log;
ALTER TABLE public.sys_model DROP COLUMN IF EXISTS auto_distribute;

-- Note: master_id backfill data is retained (cannot be safely rolled back to NULL)

COMMIT;
