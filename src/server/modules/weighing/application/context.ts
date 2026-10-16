/** Dependencies shared by the weighing use cases (injected so tests control time and IDs). */
import type { AdapterLogger } from '../../../integrations/http';
import type {
  AuditEventRepository,
  OperatorRepository,
  StationRepository,
  WeighingSessionRepository,
} from '../domain/repositories';

export interface WeighingContext {
  stationId: string;
  operators: OperatorRepository;
  station: StationRepository;
  sessions: WeighingSessionRepository;
  audit: AuditEventRepository;
  now: () => Date;
  newId: () => string;
  logger: AdapterLogger;
}
