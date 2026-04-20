BEGIN;

-- Phase 1: additive changes for P2.2 distribution support

-- 1. Add auto_distribute column to sys_model
ALTER TABLE public.sys_model
  ADD COLUMN IF NOT EXISTS auto_distribute BOOLEAN NOT NULL DEFAULT false;

-- 2. Create sys_distribution_log table
CREATE TABLE IF NOT EXISTS public.sys_distribution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  source_org_id UUID,
  target_org_id UUID,
  field_column VARCHAR(64),
  before_value JSONB,
  after_value JSONB,
  operator_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sys_distribution_log_model_record
  ON public.sys_distribution_log(model_id, record_id);
CREATE INDEX IF NOT EXISTS idx_sys_distribution_log_operator
  ON public.sys_distribution_log(operator_id, created_at);

-- 3. Backfill master_id on all distributed business tables
DO $$
DECLARE
  t RECORD;
  biz_table TEXT;
BEGIN
  FOR t IN
    SELECT m.code AS model_code, a.code AS app_code
    FROM sys_model m
    JOIN sys_app a ON m.app_id = a.id
    WHERE m.data_scope = 'distributed'
  LOOP
    biz_table := t.app_code || '_' || t.model_code;
    EXECUTE format('UPDATE biz.%I SET master_id = id WHERE master_id IS NULL', biz_table);
  END LOOP;
END $$;

COMMIT;
