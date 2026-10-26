/**
 * ConsumptionWriteBack — delivery of a completed batch's consumption to OrgaTEX (ADR-10).
 * PENDING until OrgaTEX has acknowledged the posting and the batch is WEIGHED; CONFIRMED is final.
 */
import type { WriteBackFailureView, WriteBackStatus } from '../../../../shared/completion';

export interface WriteBackProps {
  batchId: string;
  sessionId: string;
  idempotencyKey: string;
  status: WriteBackStatus;
  attempts: number;
  lastError: WriteBackFailureView | null;
  postingId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ConsumptionWriteBack {
  private constructor(private readonly props: WriteBackProps) {}

  /** A new write-back: PENDING, nothing sent yet. The key is fixed from here on. */
  static request(input: {
    batchId: string;
    sessionId: string;
    idempotencyKey: string;
    now: Date;
  }): ConsumptionWriteBack {
    const at = input.now.toISOString();
    return new ConsumptionWriteBack({
      batchId: input.batchId,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      postingId: null,
      confirmedAt: null,
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: WriteBackProps): ConsumptionWriteBack {
    return new ConsumptionWriteBack(structuredClone(props));
  }

  get batchId(): string {
    return this.props.batchId;
  }
  get sessionId(): string {
    return this.props.sessionId;
  }
  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  get status(): WriteBackStatus {
    return this.props.status;
  }
  get attempts(): number {
    return this.props.attempts;
  }
  get isConfirmed(): boolean {
    return this.props.status === 'CONFIRMED';
  }

  /** The posting was acknowledged and the batch is WEIGHED. */
  confirm(receipt: { postingId: string; receivedAt: string }, now: Date): void {
    this.assertOpen();
    this.props.attempts += 1;
    this.props.status = 'CONFIRMED';
    this.props.postingId = receipt.postingId;
    this.props.confirmedAt = receipt.receivedAt;
    this.props.lastError = null;
    this.props.updatedAt = now.toISOString();
  }

  /** The send did not complete: stays PENDING with the reason (nothing is lost). */
  defer(failure: WriteBackFailureView, now: Date, postingId: string | null = null): void {
    this.assertOpen();
    this.props.attempts += 1;
    this.props.lastError = { code: failure.code, message: failure.message };
    this.props.postingId = postingId ?? this.props.postingId;
    this.props.updatedAt = now.toISOString();
  }

  snapshot(): WriteBackProps {
    return structuredClone(this.props);
  }

  private assertOpen(): void {
    if (this.props.status === 'CONFIRMED') {
      throw new Error('A confirmed write-back is final');
    }
  }
}
