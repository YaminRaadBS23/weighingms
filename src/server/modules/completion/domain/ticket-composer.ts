/**
 * TicketComposer — builds the ticket's content from a completed session and its records (pure).
 * The text is 32 characters wide; the printed, previewed and reprinted ticket use these exact lines.
 */
import type { TicketContent, TicketRow } from '../../../../shared/ticket';
import { convert, formatValue } from '../../../../shared/quantity';
import type { WeighingRecord } from '../../weighing/domain/weighing-record';
import type { WeighingSessionProps } from '../../weighing/domain/weighing-session';

export const TICKET_WIDTH = 32;
export const TICKET_TITLE = 'FCI DYEING — WEIGHING TICKET';
const RULE = '-'.repeat(TICKET_WIDTH);
const VERDICT_OK = 'ALL WITHIN TOLERANCE';
const NONE = '-';

/** Cuts a field to `width`, marking the cut with "~". */
export function fit(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}~`;
}

const field = (label: string, value: string): string =>
  `${label.padEnd(8)}${fit(value, TICKET_WIDTH - 8)}`;

const rowLine = (name: string, target: string, actual: string, unit: string): string =>
  `${fit(name, 10).padEnd(10)} ${target.padStart(7)} ${actual.padStart(7)} ${unit.padEnd(3)}`;

/** The 32-character lines of a ticket, from its structured fields. */
export function layout(c: Omit<TicketContent, 'lines'>): string[] {
  return [
    c.title,
    ...(c.reprint ? ['*** REPRINT ***'] : []),
    RULE,
    field('BATCH', c.batch),
    field('ORDER', c.order),
    field('MACHINE', c.machine),
    field('SHADE', c.shade),
    field('DATE', c.date),
    field('OPER.', c.operator),
    RULE,
    rowLine('COMPONENT', 'TGT', 'ACT', 'UNIT'),
    ...c.rows.map((r) => rowLine(r.shortName, r.target, r.actual, r.unit)),
    RULE,
    ...c.verdict,
  ];
}

export interface ComposeInput {
  session: WeighingSessionProps;
  records: readonly WeighingRecord[];
  operator: { operatorId: string; name: string } | undefined;
}

export function compose(input: ComposeInput): TicketContent {
  const { session } = input;
  const records = [...input.records].sort((a, b) => a.sequence - b.sequence);
  const shortNames = new Map(
    session.recipe.components.map((c) => [c.sequence, c.dyestuff.shortName] as const),
  );
  const rows: TicketRow[] = records.map((r) => ({
    shortName: shortNames.get(r.sequence) ?? r.dyestuffName,
    target: formatValue(r.target),
    actual: formatValue(convert(r.actual, r.target.unit)),
    unit: r.target.unit,
  }));
  const exceptions = records
    .filter((r) => r.result === 'OVERRIDDEN')
    .map((r) =>
      fit(`EXCEPTION ${shortNames.get(r.sequence) ?? r.dyestuffName} OVERRIDDEN`, TICKET_WIDTH),
    );
  const completedAt = session.completedAt ?? session.updatedAt;
  const body: Omit<TicketContent, 'lines'> = {
    title: TICKET_TITLE,
    batch: session.batchId,
    order: session.recipe.orderRef ?? NONE,
    machine: session.recipe.machineRef ?? NONE,
    shade: session.recipe.shade,
    date: `${completedAt.slice(0, 10)} ${completedAt.slice(11, 16)}`,
    operator: input.operator
      ? `${input.operator.name} (${input.operator.operatorId})`
      : session.startedBy,
    rows,
    verdict: exceptions.length > 0 ? exceptions : [VERDICT_OK],
    barcodeValue: session.batchId,
    reprint: false,
  };
  return { ...body, lines: layout(body) };
}

/** The same ticket marked REPRINT: only the marking differs from the stored content. */
export function asReprint(content: TicketContent): TicketContent {
  const marked: TicketContent = { ...content, reprint: true };
  return { ...marked, lines: layout(marked) };
}
