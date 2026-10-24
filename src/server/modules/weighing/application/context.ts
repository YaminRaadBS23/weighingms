/** Dependencies shared by the weighing use cases (injected so tests control time and IDs). */
import type { AdapterLogger } from '../../../integrations/http';
import type {
  AuditEventRepository,
  OperatorRepository,
  StationRepository,
  WeighingRecordRepository,
  WeighingSessionRepository,
} from '../domain/repositories';

export interface WeighingContext {
  stationId: string;
  operators: OperatorRepository;
  station: StationRepository;
  sessions: WeighingSessionRepository;
  audit: AuditEventRepository;
  records: WeighingRecordRepository;
  now: () => Date;
  newId: () => string;
  logger: AdapterLogger;
  /** Runs several repository writes as one transaction (e.g. a reselection and its audit event). */
  atomically<T>(fn: () => T): T;
}
