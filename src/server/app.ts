import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { ErrorCode, type ErrorBody } from '../shared/errors';
import type { AppConfig } from './config';
import { openWeighingDb, type WeighingDb } from './db/weighingms/db';
import { DomainError } from './errors';
import { openOrgatexDb, type OrgatexDb } from './integrations/orgatex/dummy/db';
import { dummyOrgatexRoutes } from './integrations/orgatex/dummy/routes';
import { readSeedFile, seedIfEmpty } from './integrations/orgatex/dummy/seed';
import type { DummyOrgatexSimulation } from './integrations/orgatex/dummy/simulation';
import { fetchHttpClient, injectHttpClient as inject, type HttpClient } from './integrations/http';
import { HttpOrgatexAdapter } from './integrations/orgatex/http-orgatex-adapter';
import { createScaleDevices } from './integrations/scale/dummy/devices';
import { dummyScaleRoutes } from './integrations/scale/dummy/routes';
import type { DeviceClock } from './integrations/scale/dummy/scale-device';
import { HttpScaleAdapter } from './integrations/scale/http-scale-adapter';
import type { ScalePort } from './integrations/scale/scale-port';
import { PrinterDevice } from './integrations/printer/dummy/printer-device';
import { dummyPrinterRoutes } from './integrations/printer/dummy/routes';
import { HttpPrinterAdapter } from './integrations/printer/http-printer-adapter';
import type { PrinterPort } from './integrations/printer/printer-port';
import { dummyScannerRoutes } from './integrations/scanner/dummy/routes';
import { ScannerDevice } from './integrations/scanner/dummy/scanner-device';
import { HttpScannerAdapter } from './integrations/scanner/http-scanner-adapter';
import type { ScannerPort } from './integrations/scanner/scanner-port';
import { BatchService } from './modules/batches/batch-service';
import { batchRoutes } from './modules/batches/routes';
import { orgatexStatusRoutes } from './modules/orgatex-status/routes';
import { peripheralRoutes } from './modules/peripherals/routes';
import { scaleRoutes } from './modules/scales/routes';
import { DrizzleContainerRepository } from './modules/materials/container-repository';
import { MaterialService } from './modules/materials/material-service';
import { materialRoutes } from './modules/materials/routes';
import {
  readStationSeed,
  seedContainersIfEmpty,
  seedOperatorsIfEmpty,
} from './modules/weighing/infrastructure/seed';
import { createWeighingModule, type WeighingModule } from './modules/weighing/module';
import { weighingRoutes } from './modules/weighing/routes';
import type { OrgatexPort } from './integrations/orgatex/orgatex-port';
import { healthRoutes } from './routes/health';

export interface AppDeps {
  config: AppConfig;
  /** Dummy OrgaTEX database file; defaults to `<dataDir>/orgatex.db`. Use ':memory:' in tests. */
  orgatexDbFile?: string;
  /** Overrides the transport used by the OrgaTEX adapter (tests use Fastify inject). */
  orgatexHttpClient?: (app: FastifyInstance) => HttpClient;
  /** Overrides the transport used by the scale adapter (tests use Fastify inject). */
  scaleHttpClient?: (app: FastifyInstance) => HttpClient;
  /** Overrides the transports of the scanner and printer adapters (tests use Fastify inject). */
  scannerHttpClient?: (app: FastifyInstance) => HttpClient;
  printerHttpClient?: (app: FastifyInstance) => HttpClient;
  /** Clock and timers of the simulated scales (tests use a controllable clock). */
  deviceClock?: DeviceClock;
  /** WeighingMS database file; defaults to `<dataDir>/weighingms.db`. Use ':memory:' in tests. */
  weighingDbFile?: string;
  /** Clock used by the weighing domain (tests control time). */
  now?: () => Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    orgatex: OrgatexPort;
    orgatexDb: OrgatexDb;
    scales: ScalePort;
    scanner: ScannerPort;
    printer: PrinterPort;
    batches: BatchService;
    materials: MaterialService;
    weighingDb: WeighingDb;
    weighing: WeighingModule;
  }
}

/** Builds the WeighingMS application (used by main.ts and by tests). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.httpStatus).send(err.toBody());
    }
    const { validation, message } = err as { validation?: unknown; message?: string };
    if (validation) {
      const body: ErrorBody = {
        error: { code: ErrorCode.VALIDATION_ERROR, message: message ?? 'Invalid request' },
      };
      return reply.code(400).send(body);
    }
    req.log.error({ err }, 'Unhandled error');
    const body: ErrorBody = {
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = {
      error: { code: ErrorCode.NOT_FOUND, message: `Route ${req.method} ${req.url} not found` },
    };
    return reply.code(404).send(body);
  });

  // ── Dummy OrgaTEX (training substitute, own database) ───────────────────
  const orgatexDb = openOrgatexDb(deps.orgatexDbFile ?? path.join(config.dataDir, 'orgatex.db'));
  const orgatexSeed = readSeedFile(path.join(config.dataDir, 'seed', 'orgatex-seed.json'));
  seedIfEmpty(orgatexDb.db, orgatexSeed);
  app.decorate('orgatexDb', orgatexDb.db);
  app.addHook('onClose', async () => orgatexDb.close());
  const orgatexSimulation: DummyOrgatexSimulation = { online: true };
  await app.register(dummyOrgatexRoutes, {
    prefix: '/ext/orgatex',
    db: orgatexDb.db,
    // Training-only `_sim` controls exist only when simulation is enabled (never in production).
    ...(config.enableSimulation
      ? { simulation: { state: orgatexSimulation, seed: orgatexSeed } }
      : {}),
  });

  // ── Dummy Scale (training substitute, in-memory devices) ────────────────
  const scaleDevices = createScaleDevices(
    path.join(config.dataDir, 'seed', 'scales-seed.json'),
    deps.deviceClock,
  );
  await app.register(dummyScaleRoutes, {
    prefix: '/ext/scale',
    devices: scaleDevices,
    simulation: config.enableSimulation,
  });

  // ── Dummy Scanner and Dummy Printer (training substitutes, in memory) ──
  await app.register(dummyScannerRoutes, {
    prefix: '/ext/scanner',
    device: new ScannerDevice(),
    simulation: config.enableSimulation,
  });
  await app.register(dummyPrinterRoutes, {
    prefix: '/ext/printer',
    device: new PrinterDevice(),
    simulation: config.enableSimulation,
  });

  // ── Ports (WeighingMS reaches external systems only through these) ─────
  const client = deps.orgatexHttpClient?.(app) ?? fetchHttpClient(config.orgatexBaseUrl);
  app.decorate(
    'orgatex',
    new HttpOrgatexAdapter({
      client,
      timeoutMs: config.orgatexTimeoutMs,
      logger: app.log.child({ component: 'orgatex-adapter' }),
    }),
  );

  app.decorate(
    'scales',
    new HttpScaleAdapter({
      client: deps.scaleHttpClient?.(app) ?? fetchHttpClient(config.scaleBaseUrl),
      timeoutMs: config.scaleTimeoutMs,
      logger: app.log.child({ component: 'scale-adapter' }),
    }),
  );

  app.decorate(
    'scanner',
    new HttpScannerAdapter({
      client: deps.scannerHttpClient?.(app) ?? fetchHttpClient(config.scannerBaseUrl),
      timeoutMs: config.scannerTimeoutMs,
      logger: app.log.child({ component: 'scanner-adapter' }),
    }),
  );
  app.decorate(
    'printer',
    new HttpPrinterAdapter({
      client: deps.printerHttpClient?.(app) ?? fetchHttpClient(config.printerBaseUrl),
      timeoutMs: config.printerTimeoutMs,
      logger: app.log.child({ component: 'printer-adapter' }),
    }),
  );

  // ── WeighingMS application services ─────────────────────────────────────
  app.decorate('batches', new BatchService(app.orgatex, config.stationId));

  const weighingDb = openWeighingDb(
    deps.weighingDbFile ?? path.join(config.dataDir, 'weighingms.db'),
  );
  const stationSeed = readStationSeed(path.join(config.dataDir, 'seed', 'station-seed.json'));
  seedOperatorsIfEmpty(weighingDb.db, stationSeed);
  seedContainersIfEmpty(weighingDb.db, stationSeed);
  app.decorate('weighingDb', weighingDb.db);
  app.decorate(
    'materials',
    new MaterialService(app.orgatex, new DrizzleContainerRepository(weighingDb.db)),
  );
  app.addHook('onClose', async () => weighingDb.close());
  app.decorate(
    'weighing',
    createWeighingModule({
      db: weighingDb.db,
      stationId: config.stationId,
      batches: app.batches,
      orgatex: app.orgatex,
      logger: app.log.child({ component: 'weighing' }),
      ...(deps.now ? { now: deps.now } : {}),
    }),
  );

  // ── WeighingMS API ──────────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(batchRoutes, { prefix: '/api', batches: app.batches });
  await app.register(materialRoutes, { prefix: '/api', materials: app.materials });
  await app.register(weighingRoutes, { prefix: '/api', weighing: app.weighing });
  await app.register(orgatexStatusRoutes, { prefix: '/api', orgatex: app.orgatex });
  await app.register(scaleRoutes, { prefix: '/api', scales: app.scales });
  await app.register(peripheralRoutes, {
    prefix: '/api',
    scanner: app.scanner,
    printer: app.printer,
  });

  return app;
}

/** Transport that calls the in-process Dummy OrgaTEX through Fastify inject (tests). */
export function injectHttpClient(app: FastifyInstance, prefix = '/ext/orgatex'): HttpClient {
  return inject(app, prefix);
}
