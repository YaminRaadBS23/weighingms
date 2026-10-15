import { mkdirSync } from 'node:fs';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });

const app = await buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { station: config.stationId, env: config.env, simulation: config.enableSimulation },
    'WeighingMS started',
  );
} catch (err) {
  app.log.error({ err }, 'WeighingMS failed to start');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
