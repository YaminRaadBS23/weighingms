-- ADR-11: a ticket is never deleted, its content and identity never change, and a PRINTED ticket is
-- final. A reprint is a new row that names a PRINTED ticket; new tickets start NOT_SENT.
CREATE TRIGGER `tickets_no_delete` BEFORE DELETE ON `tickets`
BEGIN
  SELECT RAISE(ABORT, 'tickets cannot be deleted (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_content_fixed` BEFORE UPDATE ON `tickets`
WHEN NEW.ticket_id <> OLD.ticket_id OR NEW.batch_id <> OLD.batch_id OR NEW.session_id <> OLD.session_id
  OR NEW.is_reprint <> OLD.is_reprint OR NEW.reprint_of IS NOT OLD.reprint_of
  OR NEW.content <> OLD.content OR NEW.barcode_value <> OLD.barcode_value
  OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'the content and identity of a ticket cannot change (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_printed_is_final` BEFORE UPDATE ON `tickets`
WHEN OLD.print_status = 'PRINTED'
BEGIN
  SELECT RAISE(ABORT, 'a printed ticket cannot change (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_printed_has_job` BEFORE UPDATE ON `tickets`
WHEN NEW.print_status = 'PRINTED' AND (NEW.job_id IS NULL OR NEW.printed_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a printed ticket needs its job and time (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_status_known` BEFORE UPDATE ON `tickets`
WHEN NEW.print_status NOT IN ('NOT_SENT', 'PRINTED', 'FAILED')
BEGIN
  SELECT RAISE(ABORT, 'unknown print status (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_start_not_sent` BEFORE INSERT ON `tickets`
WHEN NEW.print_status <> 'NOT_SENT' OR NEW.print_attempts <> 0
BEGIN
  SELECT RAISE(ABORT, 'a new ticket starts NOT_SENT (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_original_has_no_source` BEFORE INSERT ON `tickets`
WHEN NEW.is_reprint = 0 AND NEW.reprint_of IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'an original ticket is not a copy of another (ADR-11)');
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_reprint_needs_printed_source` BEFORE INSERT ON `tickets`
WHEN NEW.is_reprint = 1 AND (
  NEW.reprint_of IS NULL
  OR (SELECT print_status FROM tickets WHERE ticket_id = NEW.reprint_of) IS NOT 'PRINTED'
)
BEGIN
  SELECT RAISE(ABORT, 'a reprint needs a printed ticket to copy (ADR-11)');
END;
