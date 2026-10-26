/**
 * Ticket — the stored weighing ticket of a completed batch (ADR-11). The content never changes;
 * only the print outcome does. PRINTED is final.
 */
import type { PrintStatus, TicketContent, TicketFailureView } from '../../../../shared/ticket';

export interface TicketProps {
  ticketId: string;
  batchId: string;
  sessionId: string;
  isReprint: boolean;
  reprintOf: string | null;
  content: TicketContent;
  printStatus: PrintStatus;
  printAttempts: number;
  lastError: TicketFailureView | null;
  jobId: string | null;
  printedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export class Ticket {
  private constructor(private readonly props: TicketProps) {}

  /** A new ticket: stored, not yet sent to the printer. */
  static create(input: {
    ticketId: string;
    batchId: string;
    sessionId: string;
    content: TicketContent;
    reprintOf: string | null;
    createdBy: string;
    now: Date;
  }): Ticket {
    const at = input.now.toISOString();
    return new Ticket({
      ticketId: input.ticketId,
      batchId: input.batchId,
      sessionId: input.sessionId,
      isReprint: input.reprintOf !== null,
      reprintOf: input.reprintOf,
      content: structuredClone(input.content),
      printStatus: 'NOT_SENT',
      printAttempts: 0,
      lastError: null,
      jobId: null,
      printedAt: null,
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: TicketProps): Ticket {
    return new Ticket(structuredClone(props));
  }

  get ticketId(): string {
    return this.props.ticketId;
  }
  get batchId(): string {
    return this.props.batchId;
  }
  get sessionId(): string {
    return this.props.sessionId;
  }
  get isReprint(): boolean {
    return this.props.isReprint;
  }
  get printStatus(): PrintStatus {
    return this.props.printStatus;
  }
  get isPrinted(): boolean {
    return this.props.printStatus === 'PRINTED';
  }
  get content(): TicketContent {
    return this.props.content;
  }

  /** The printer accepted the document. */
  markPrinted(job: { jobId: string; printedAt: string }, now: Date): void {
    this.assertNotPrinted();
    this.props.printAttempts += 1;
    this.props.printStatus = 'PRINTED';
    this.props.jobId = job.jobId;
    this.props.printedAt = job.printedAt;
    this.props.lastError = null;
    this.props.updatedAt = now.toISOString();
  }

  /** The printer refused: nothing else about the ticket changes. */
  markFailed(failure: TicketFailureView, now: Date): void {
    this.assertNotPrinted();
    this.props.printAttempts += 1;
    this.props.printStatus = 'FAILED';
    this.props.lastError = { ...failure };
    this.props.updatedAt = now.toISOString();
  }

  snapshot(): TicketProps {
    return structuredClone(this.props);
  }

  private assertNotPrinted(): void {
    if (this.isPrinted) throw new Error('A printed ticket is final');
  }
}
