-- ADR-9: a record is OVERRIDDEN exactly when it carries a complete override. SQLite cannot add a CHECK to an
-- existing table, so the rule is enforced by an insert trigger. (UPDATE and DELETE are already aborted by 0005.)
CREATE TRIGGER `weighing_records_override_consistency` BEFORE INSERT ON `weighing_records`
WHEN (NEW.result = 'OVERRIDDEN') <> (NEW.override_supervisor_id IS NOT NULL)
  OR (NEW.override_supervisor_id IS NOT NULL AND (
        length(trim(coalesce(NEW.override_reason, ''))) = 0
        OR coalesce(NEW.override_zone, '') NOT IN ('UNDER', 'NEAR', 'OVER')
        OR NEW.override_at IS NULL))
  OR (NEW.override_supervisor_id IS NULL AND (
        NEW.override_reason IS NOT NULL OR NEW.override_zone IS NOT NULL OR NEW.override_at IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT, 'an override must be complete exactly when the record is OVERRIDDEN (ADR-9)');
END;
