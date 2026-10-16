import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openWeighingDb } from '../../db/weighingms/db';
import { LotNotFoundError, OrgatexUnavailableError } from '../../errors';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import { readStationSeed, seedContainersIfEmpty } from '../weighing/infrastructure/seed';
import { DrizzleContainerRepository } from './container-repository';
import { MaterialService } from './material-service';

const LOTS: Record<string, string> = {
  '2026-0341': 'DYE-1180',
  '2026-0387': 'DYE-4471',
  '2026-0402': 'DYE-4471',
};

function fakePort(calls: string[], offline = false): OrgatexPort {
  return {
    findLot: async (lotId: string) => {
      calls.push(lotId);
      if (offline) throw new OrgatexUnavailableError('down');
      const dyestuffCode = LOTS[lotId];
      if (!dyestuffCode) throw new LotNotFoundError(lotId);
      return { lotId, dyestuffCode };
    },
  } as unknown as OrgatexPort;
}

let close: (() => void) | undefined;
afterEach(() => close?.());

function service(calls: string[] = [], offline = false) {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedContainersIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
  return new MaterialService(fakePort(calls, offline), new DrizzleContainerRepository(opened.db));
}

describe('MaterialService.validateLot', () => {
  it('accepts a lot of the dyestuff, including the training-only lot', async () => {
    const s = service();
    expect(await s.validateLot('DYE-4471', '2026-0387')).toEqual({
      lotId: '2026-0387',
      dyestuffCode: 'DYE-4471',
    });
    expect((await s.validateLot('DYE-4471', '2026-0402')).lotId).toBe('2026-0402');
  });
  it('refuses another dyestuff’s lot with LOT_MISMATCH', async () => {
    await expect(service().validateLot('DYE-4471', '2026-0341')).rejects.toMatchObject({
      code: 'LOT_MISMATCH',
      httpStatus: 422,
    });
  });
  it('passes LOT_NOT_FOUND and ORGATEX_UNAVAILABLE through', async () => {
    await expect(service().validateLot('DYE-4471', '9999-9999')).rejects.toMatchObject({
      code: 'LOT_NOT_FOUND',
    });
    await expect(service([], true).validateLot('DYE-4471', '2026-0387')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
    });
  });
  it('trims the scanned text before the lookup', async () => {
    const calls: string[] = [];
    await service(calls).validateLot('DYE-4471', '  2026-0387 \n');
    expect(calls).toEqual(['2026-0387']);
  });
});

describe('MaterialService.resolveLot', () => {
  it('returns the suggested lot without calling OrgaTEX, even while OrgaTEX is offline', async () => {
    const calls: string[] = [];
    const s = service(calls, true);
    expect(await s.resolveLot('DYE-4471', '2026-0387')).toBe('2026-0387');
    expect(await s.resolveLot('DYE-4471', '2026-0387', '   ')).toBe('2026-0387');
    expect(await s.resolveLot('DYE-4471', null)).toBeNull();
    expect(calls).toEqual([]);
  });
  it('validates a scanned lot and returns it instead of the suggestion', async () => {
    const calls: string[] = [];
    expect(await service(calls).resolveLot('DYE-4471', '2026-0387', '2026-0402')).toBe('2026-0402');
    expect(calls).toEqual(['2026-0402']);
  });
  it('refuses a scanned lot of the wrong dyestuff', async () => {
    await expect(service().resolveLot('DYE-4471', '2026-0387', '2026-0341')).rejects.toMatchObject({
      code: 'LOT_MISMATCH',
    });
  });
  it('a scanned lot with OrgaTEX offline fails with ORGATEX_UNAVAILABLE (the suggestion stays usable)', async () => {
    await expect(
      service([], true).resolveLot('DYE-4471', '2026-0387', '2026-0402'),
    ).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
    });
  });
});

describe('MaterialService containers', () => {
  it('validates a container, normalising case and spaces', () => {
    expect(service().validateContainer(' c-12 ')).toMatchObject({
      containerId: 'C-12',
      tare: { value: '214.0', unit: 'g' },
    });
  });
  it('CONTAINER_UNKNOWN for C-99, CONTAINER_OUT_OF_SERVICE for C-13', () => {
    expect(() => service().validateContainer('C-99')).toThrowError(
      expect.objectContaining({ code: 'CONTAINER_UNKNOWN', httpStatus: 404 }),
    );
    expect(() => service().validateContainer('C-13')).toThrowError(
      expect.objectContaining({ code: 'CONTAINER_OUT_OF_SERVICE', httpStatus: 422 }),
    );
  });
  it.each([
    ['DYE-1180', 'C-09'],
    ['DYE-2204', 'C-11'],
    ['DYE-4471', 'C-12'],
    ['AUX-0101', 'D-03'],
    ['AUX-0107', 'D-05'],
  ])('the default container for %s is %s', (dyestuff, container) => {
    expect(service().defaultContainerFor(dyestuff)?.containerId).toBe(container);
  });
  it('has no default container for an unknown dyestuff', () => {
    expect(service().defaultContainerFor('DYE-0000')).toBeNull();
  });
});
