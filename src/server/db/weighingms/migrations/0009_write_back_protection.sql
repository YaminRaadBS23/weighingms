-- ADR-10: a write-back is never deleted, its identity (batch, session, key) never changes, and a
-- CONFIRMED write-back is final. CONFIRMED must carry its receipt (time and posting id).
CREATE TRIGGER `write_backs_no_delete` BEFORE DELETE ON `write_backs`
BEGIN
  SELECT RAISE(ABORT, 'write-backs cannot be deleted (ADR-10)');
END;
--> statement-breakpoint
CREATE TRIGGER `write_backs_identity_fixed` BEFORE UPDATE ON `write_backs`
WHEN NEW.batch_id <> OLD.batch_id OR NEW.session_id <> OLD.session_id OR NEW.idempotency_key <> OLD.idempotency_key
BEGIN
  SELECT RAISE(ABORT, 'the batch, session and idempotency key of a write-back cannot change (ADR-10)');
END;
--> statement-breakpoint
CREATE TRIGGER `write_backs_confirmed_is_final` BEFORE UPDATE ON `write_backs`
WHEN OLD.status = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'a confirmed write-back cannot change (ADR-10)');
END;
--> statement-breakpoint
CREATE TRIGGER `write_backs_confirmed_has_receipt` BEFORE UPDATE ON `write_backs`
WHEN NEW.status = 'CONFIRMED' AND (NEW.confirmed_at IS NULL OR NEW.posting_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a confirmed write-back needs its receipt (ADR-10)');
END;
--> statement-breakpoint
CREATE TRIGGER `write_backs_status_known` BEFORE INSERT ON `write_backs`
WHEN NEW.status NOT IN ('PENDING', 'CONFIRMED')
BEGIN
  SELECT RAISE(ABORT, 'unknown write-back status (ADR-10)');
END;
