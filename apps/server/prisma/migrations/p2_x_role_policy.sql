-- Add createdBy to sys_app for designer ownership tracking
ALTER TABLE sys_app ADD COLUMN created_by UUID REFERENCES sys_user(id) ON DELETE SET NULL;
