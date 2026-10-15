import path from 'node:path';

export type AppEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  env: AppEnv;
  host: string;
  port: number;
  stationId: string;
  dataDir: string;
  /** Base URL the OrgaTEX adapter uses to reach (Dummy) OrgaTEX. */
  orgatexBaseUrl: string;
  /** Adapter timeout for OrgaTEX calls. */
  orgatexTimeoutMs: number;
  /** Base URL the scale adapter uses to reach the (Dummy) scales. */
  scaleBaseUrl: string;
  /** Adapter timeout for scale calls (kept short: readings are polled at 10 Hz). */
  scaleTimeoutMs: number;
  scannerBaseUrl: string;
  scannerTimeoutMs: number;
  printerBaseUrl: string;
  printerTimeoutMs: number;
  /** Registers training-only `/ext/*\/_sim` controls (never in production). */
  enableSimulation: boolean;
  logLevel: string;
}

function parseEnv(value: string | undefined): AppEnv {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = parseEnv(env.APP_ENV ?? env.NODE_ENV);
  const host = env.HOST ?? '127.0.0.1';
  const port = Number(env.PORT ?? 3000);
  return {
    env: appEnv,
    host,
    port,
    stationId: env.STATION_ID ?? 'STN-01',
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    orgatexBaseUrl: env.ORGATEX_BASE_URL ?? `http://${host}:${port}/ext/orgatex`,
    orgatexTimeoutMs: Number(env.ORGATEX_TIMEOUT_MS ?? 2000),
    scaleBaseUrl: env.SCALE_BASE_URL ?? `http://${host}:${port}/ext/scale`,
    scaleTimeoutMs: Number(env.SCALE_TIMEOUT_MS ?? 500),
    scannerBaseUrl: env.SCANNER_BASE_URL ?? `http://${host}:${port}/ext/scanner`,
    scannerTimeoutMs: Number(env.SCANNER_TIMEOUT_MS ?? 500),
    printerBaseUrl: env.PRINTER_BASE_URL ?? `http://${host}:${port}/ext/printer`,
    printerTimeoutMs: Number(env.PRINTER_TIMEOUT_MS ?? 2000),
    enableSimulation: appEnv !== 'production',
    logLevel: env.LOG_LEVEL ?? (appEnv === 'test' ? 'silent' : 'info'),
  };
}
