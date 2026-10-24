-- ADR-1 technique (NFR-8): weighing records are append-only. Any UPDATE or DELETE is aborted by the database.
CREATE TRIGGER `weighing_records_no_update` BEFORE UPDATE ON `weighing_records`
BEGIN
  SELECT RAISE(ABORT, 'weighing_records are immutable (NFR-8)');
END;
--> statement-breakpoint
CREATE TRIGGER `weighing_records_no_delete` BEFORE DELETE ON `weighing_records`
BEGIN
  SELECT RAISE(ABORT, 'weighing_records are immutable (NFR-8)');
END;
