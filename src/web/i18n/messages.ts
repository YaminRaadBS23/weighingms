/**
 * English message catalogue for every operator-facing string (NFR-11/NFR-13, ux-guide.md).
 * Wording follows the prototype (docs/customize-weighing-station.html) where it has one.
 */
const en = {
  'brand.name': 'WeighingMS',
  'brand.station': 'STATION {station}',

  'crumb.batch': 'BATCH',
  'crumb.order': 'ORDER',
  'crumb.machine': 'MACHINE',
  'operator.label': 'Operator',
  'operator.signOut': 'Sign out',

  'strip.scale': 'SCALE {capacity}',
  'strip.scanner': 'SCANNER',
  'strip.printer': 'PRINTER',
  'strip.orgatex': 'ORGATEX',
  'strip.linked': 'LINKED {time}',
  'strip.language': 'EN',
  'state.READY': 'READY',
  'state.OFFLINE': 'OFFLINE',
  'state.CAL_EXPIRED': 'CAL EXPIRED',
  'state.OUT_OF_PAPER': 'OUT OF PAPER',
  'state.UNKNOWN': '—',

  'signIn.title': 'Scan your badge to sign in',
  'signIn.hint': 'Or type the badge number below.',
  'signIn.unknown': 'Badge not recognised or operator inactive',

  'scan.typedLabel': 'Type code',
  'scan.submit': 'Enter',
  'scan.placeholder': 'e.g. {example}',

  'queue.scanTitle': 'Scan a batch card to begin',
  'queue.scanHint': 'Or touch a row below. Queue received from OrgaTEX at {time}.',
  'queue.col.batch': 'Batch',
  'queue.col.order': 'Order',
  'queue.col.machine': 'Machine',
  'queue.col.fabric': 'Fabric / lot',
  'queue.col.shade': 'Shade',
  'queue.col.components': 'Comp.',
  'queue.col.status': 'Status',
  'queue.loading': 'Loading the batch queue…',
  'queue.empty': 'No batches in the queue for this station.',
  'queue.orgatexDown': 'OrgaTEX not reachable',
  'queue.orgatexDownHint': 'The batch queue cannot be loaded. Check the connection and retry.',
  'queue.retry': 'Retry',
  'queue.selecting': 'Opening batch {batchId}…',
  'queue.notSelectable': 'Batch {batchId}: {reason}',
  'queue.notABatch': '{code} is not a batch card.',
  'status.QUEUED': 'QUEUED',
  'status.RELEASED': 'RELEASED',
  'status.WEIGHING': 'WEIGHING',
  'status.WEIGHED': 'WEIGHED',

  'weigh.placeholderTitle': 'Weighing session started',
  'weigh.placeholderNote': 'The weighing screen arrives in bolt 011.',
  'weigh.recipe': 'Recipe · {shade}',
  'weigh.components': '{done} of {total} components weighed',

  'error.generic': 'Something went wrong: {message}',
  'error.network': 'WeighingMS server not reachable',
} as const;

export type MessageKey = keyof typeof en;

/** Looks up a message and fills `{placeholders}`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
