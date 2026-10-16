import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import { openWeighingDb } from '../../db/weighingms/db';
import { containers } from '../../db/weighingms/schema';
import {
  readStationSeed,
  seedContainersIfEmpty,
  seedOperatorsIfEmpty,
} from '../weighing/infrastructure/seed';
import { DrizzleContainerRepository } from './container-repository';

const SEED = path.resolve('data/seed/station-seed.json');

let close: (() => void) | undefined;
afterEach(() => close?.());

function open() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  return opened.db;
}

describe('Container master seed (DB-5, brief §9.3)', () => {
  it('seeds the six training containers with exact tares, types and service state', () => {
    const db = open();
    expect(seedContainersIfEmpty(db, readStationSeed(SEED))).toBe(true);
    const repo = new DrizzleContainerRepository(db);
    expect(repo.list()).toEqual([
      {
        containerId: 'C-09',
        type: 'BUCKET',
        tare: { value: '214.0', unit: 'g' },
        inService: true,
        defaultFor: 'DYE-1180',
      },
      {
        containerId: 'C-11',
        type: 'BUCKET',
        tare: { value: '214.0', unit: 'g' },
        inService: true,
        defaultFor: 'DYE-2204',
      },
      {
        containerId: 'C-12',
        type: 'BUCKET',
        tare: { value: '214.0', unit: 'g' },
        inService: true,
        defaultFor: 'DYE-4471',
      },
      {
        containerId: 'C-13',
        type: 'BUCKET',
        tare: { value: '214.0', unit: 'g' },
        inService: false,
        defaultFor: null,
      },
      {
        containerId: 'D-03',
        type: 'DRUM',
        tare: { value: '1.850', unit: 'kg' },
        inService: true,
        defaultFor: 'AUX-0101',
      },
      {
        containerId: 'D-05',
        type: 'DRUM',
        tare: { value: '1.850', unit: 'kg' },
        inService: true,
        defaultFor: 'AUX-0107',
      },
    ]);
  });

  it('a second start does not duplicate the containers', () => {
    const db = open();
    const seed = readStationSeed(SEED);
    seedContainersIfEmpty(db, seed);
    expect(seedContainersIfEmpty(db, seed)).toBe(false);
    expect(new DrizzleContainerRepository(db).list()).toHaveLength(6);
  });

  it('an existing database that already has operators receives the containers and keeps its operators', () => {
    const db = open();
    const seed = readStationSeed(SEED);
    seedOperatorsIfEmpty(db, seed); // the state left by earlier bolts: operators, no containers
    expect(new DrizzleContainerRepository(db).list()).toHaveLength(0);
    expect(seedContainersIfEmpty(db, seed)).toBe(true);
    expect(seedOperatorsIfEmpty(db, seed)).toBe(false);
    expect(new DrizzleContainerRepository(db).list()).toHaveLength(6);
  });

  it('looks containers up by ID and by default dyestuff', () => {
    const db = open();
    seedContainersIfEmpty(db, readStationSeed(SEED));
    const repo = new DrizzleContainerRepository(db);
    expect(repo.findById('D-05')?.tare).toEqual({ value: '1.850', unit: 'kg' });
    expect(repo.findById('C-99')).toBeUndefined();
    expect(repo.findDefaultFor('DYE-4471')?.containerId).toBe('C-12');
    expect(repo.findDefaultFor('NOPE')).toBeUndefined();
  });

  it('the database refuses two containers defaulting to the same dyestuff', () => {
    const db = open();
    seedContainersIfEmpty(db, readStationSeed(SEED));
    expect(() =>
      db
        .insert(containers)
        .values({
          containerId: 'C-20',
          type: 'BUCKET',
          tareValue: '1',
          tareUnit: 'g',
          inService: true,
          defaultDyestuffCode: 'DYE-1180',
        })
        .run(),
    ).toThrow();
  });
});

describe('readStationSeed validation of containers', () => {
  const withContainers = (list: unknown[]) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'seed-'));
    const file = path.join(dir, 'seed.json');
    const base = readStationSeed(SEED);
    writeFileSync(file, JSON.stringify({ ...base, containers: list }));
    return file;
  };
  const good = {
    containerId: 'C-01',
    type: 'BUCKET',
    tare: { value: '1.0', unit: 'g' },
    inService: true,
    defaultDyestuffCode: null,
  };

  it('accepts a valid container', () => {
    expect(readStationSeed(withContainers([good])).containers).toHaveLength(1);
  });
  it('rejects a malformed ID, a bad tare, and two defaults for one dyestuff', () => {
    expect(() => readStationSeed(withContainers([{ ...good, containerId: 'X1' }]))).toThrow(
      /Invalid container ID/,
    );
    expect(() =>
      readStationSeed(withContainers([{ ...good, tare: { value: 'abc', unit: 'g' } }])),
    ).toThrow();
    expect(() =>
      readStationSeed(withContainers([{ ...good, tare: { value: '1', unit: 'lb' } }])),
    ).toThrow(/tare unit/);
    const a = { ...good, defaultDyestuffCode: 'DYE-1' };
    const b = { ...good, containerId: 'C-02', defaultDyestuffCode: 'DYE-1' };
    expect(() => readStationSeed(withContainers([a, b]))).toThrow(/Two containers default/);
  });
});
