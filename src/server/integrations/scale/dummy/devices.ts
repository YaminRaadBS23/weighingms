import { readFileSync } from 'node:fs';
import type { FastifyReply } from 'fastify';
import { ScaleDevice, type DeviceClock, type ScaleConfig } from './scale-device';

/** Reads `data/seed/scales-seed.json` and creates one simulated device per scale. */
export function createScaleDevices(
  seedFile: string,
  clock?: DeviceClock,
): Map<string, ScaleDevice> {
  const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as { scales: ScaleConfig[] };
  return new Map(seed.scales.map((c) => [c.scaleId, new ScaleDevice(c, clock)]));
}

export function deviceOr404(
  devices: Map<string, ScaleDevice>,
  scaleId: string,
  reply: FastifyReply,
): ScaleDevice | undefined {
  const device = devices.get(scaleId);
  if (!device) {
    void reply
      .code(404)
      .send({ error: { code: 'SCALE_NOT_FOUND', message: `Scale ${scaleId} not found` } });
  }
  return device;
}
