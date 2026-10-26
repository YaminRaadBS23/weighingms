/** Builds the OrgaTEX consumption posting from the immutable weighing records (BR-12, IR-05). */
import type {
  OrgatexConsumptionLine,
  OrgatexConsumptionPosting,
} from '../../../integrations/orgatex/orgatex-port';
import type { WeighingRecord } from '../../weighing/domain/weighing-record';

export function buildPosting(input: {
  completedAt: string;
  operatorId: string;
  records: readonly WeighingRecord[];
}): OrgatexConsumptionPosting {
  const lines: OrgatexConsumptionLine[] = [...input.records]
    .sort((a, b) => a.sequence - b.sequence)
    .map((r) => ({
      sequence: r.sequence,
      dyestuffCode: r.dyestuffCode,
      lotId: r.lotId,
      actual: r.actual,
      target: r.target,
      result: r.result,
    }));
  return { completedAt: input.completedAt, operatorId: input.operatorId, lines };
}
