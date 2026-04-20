-- Rollback Phase 2: relax master_id back to nullable for all distributed biz tables.

DO $$
DECLARE t RECORD; biz_table TEXT;
BEGIN
  FOR t IN
    SELECT m.code AS model_code, a.code AS app_code
    FROM sys_model m
    JOIN sys_app a ON m.app_id = a.id
    WHERE m.data_scope = 'distributed'
  LOOP
    biz_table := t.app_code || '_' || t.model_code;
    EXECUTE format('ALTER TABLE biz.%I ALTER COLUMN master_id DROP NOT NULL', biz_table);
  END LOOP;
END $$;
