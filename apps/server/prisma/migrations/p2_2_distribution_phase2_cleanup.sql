-- Phase 2: cleanup — enforce master_id NOT NULL on all distributed biz tables.
-- Run AFTER Phase 1 (additive) + after the new server code is deployed, so every
-- existing row has master_id populated (self-reference for masters; target ref for copies).

DO $$
DECLARE t RECORD; biz_table TEXT; null_count INT;
BEGIN
  FOR t IN
    SELECT m.code AS model_code, a.code AS app_code
    FROM sys_model m
    JOIN sys_app a ON m.app_id = a.id
    WHERE m.data_scope = 'distributed'
  LOOP
    biz_table := t.app_code || '_' || t.model_code;

    -- Guard: refuse to set NOT NULL if any rows still have master_id = NULL.
    EXECUTE format('SELECT COUNT(*) FROM biz.%I WHERE master_id IS NULL', biz_table)
      INTO null_count;
    IF null_count > 0 THEN
      RAISE EXCEPTION
        'Table biz.% has % rows with NULL master_id — run Phase 1 additive SQL before Phase 2.',
        biz_table, null_count;
    END IF;

    EXECUTE format('ALTER TABLE biz.%I ALTER COLUMN master_id SET NOT NULL', biz_table);
  END LOOP;
END $$;
