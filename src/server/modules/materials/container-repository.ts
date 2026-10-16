/** Container master data in weighingms.db (read-only here; the master is the seed for training). */
import { asc, eq } from 'drizzle-orm';
import type { Unit } from '../../../shared/quantity';
import type { ContainerView } from '../../../shared/materials';
import type { WeighingDb } from '../../db/weighingms/db';
import { containers } from '../../db/weighingms/schema';

function toView(row: typeof containers.$inferSelect): ContainerView {
  return {
    containerId: row.containerId,
    type: row.type,
    tare: { value: row.tareValue, unit: row.tareUnit as Unit },
    inService: row.inService,
    defaultFor: row.defaultDyestuffCode,
  };
}

export interface ContainerRepository {
  list(): ContainerView[];
  findById(containerId: string): ContainerView | undefined;
  findDefaultFor(dyestuffCode: string): ContainerView | undefined;
}

export class DrizzleContainerRepository implements ContainerRepository {
  constructor(private readonly db: WeighingDb) {}

  list(): ContainerView[] {
    return this.db.select().from(containers).orderBy(asc(containers.containerId)).all().map(toView);
  }

  findById(containerId: string): ContainerView | undefined {
    const row = this.db
      .select()
      .from(containers)
      .where(eq(containers.containerId, containerId))
      .get();
    return row && toView(row);
  }

  findDefaultFor(dyestuffCode: string): ContainerView | undefined {
    const row = this.db
      .select()
      .from(containers)
      .where(eq(containers.defaultDyestuffCode, dyestuffCode))
      .get();
    return row && toView(row);
  }
}
