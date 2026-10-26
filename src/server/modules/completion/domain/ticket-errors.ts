import { ErrorCode } from '../../../../shared/errors';
import { DomainError, NotFoundError } from '../../../errors';

export class TicketNotFoundError extends NotFoundError {
  constructor(ticketId: string) {
    super(ErrorCode.TICKET_NOT_FOUND, `Ticket ${ticketId} not found`, { ticketId });
  }
}

/** Only a printed ticket can be reprinted; a ticket that never printed is retried instead. */
export class TicketNotPrintedError extends DomainError {
  constructor(ticketId: string, printStatus: string) {
    super(
      ErrorCode.TICKET_NOT_PRINTED,
      `Ticket ${ticketId} has not been printed (${printStatus}); retry the print instead`,
      409,
      { ticketId, printStatus },
    );
  }
}

/**
 * The printer refused. The ticket is already stored as FAILED (ADR-11): the answer is the port's
 * own error (same code and status) plus the ticket to retry.
 */
export class TicketPrintError extends DomainError {
  constructor(source: DomainError, ticketId: string) {
    super(source.code, source.message, source.httpStatus, {
      ...source.details,
      ticketId,
      printStatus: 'FAILED',
    });
  }
}
