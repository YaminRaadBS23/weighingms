-- ADR-1: audit events are append-only. Any UPDATE or DELETE is aborted by the database.
CREATE TRIGGER `audit_events_no_update` BEFORE UPDATE ON `audit_events`
BEGIN
  SELECT RAISE(ABORT, 'audit_events are immutable (ADR-1)');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete` BEFORE DELETE ON `audit_events`
BEGIN
  SELECT RAISE(ABORT, 'audit_events are immutable (ADR-1)');
END;
