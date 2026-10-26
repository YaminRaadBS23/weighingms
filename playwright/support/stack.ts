import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Stack {
  /** The station UI (Vite), which proxies /api and /ext to the server. */
  url: string;
  /** The WeighingMS server itself. */
  apiUrl: string;
  dataDir: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string, child: ChildProcess, log: () => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${url}: the process exited\n${log()}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${url} did not answer within 60 s\n${log()}`);
}

function start(cmd: string, args: string[], env: Record<string, string>) {
  let output = '';
  const child = spawn(path.join(ROOT, 'node_modules', '.bin', cmd), args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  return { child, log: () => output.slice(-2000) };
}

const stop = (child: ChildProcess) => {
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
};

/**
 * A complete, separate WeighingMS for one test: the server on a copy of the seed data (so
 * B-24187 is released and untouched) with the Dummy systems and `_sim` routes, and the web UI.
 * WeighingMS keeps its own records immutable, so a clean scenario means a clean data folder.
 */
export const test = base.extend<{ stack: Stack }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures argument to be destructured
  stack: async ({}, use) => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'weighingms-e2e-'));
    await cp(path.join(ROOT, 'data', 'seed'), path.join(dataDir, 'seed'), { recursive: true });
    const [apiPort, webPort] = [await freePort(), await freePort()];
    const api = start('tsx', ['src/server/main.ts'], {
      PORT: String(apiPort),
      DATA_DIR: dataDir,
    });
    const web = start('vite', ['--port', String(webPort), '--strictPort'], {
      PORT: String(apiPort),
    });
    try {
      await waitFor(`http://127.0.0.1:${apiPort}/api/operators/current`, api.child, api.log);
      await waitFor(`http://127.0.0.1:${webPort}/`, web.child, web.log);
      await use({
        url: `http://127.0.0.1:${webPort}`,
        apiUrl: `http://127.0.0.1:${apiPort}`,
        dataDir,
      });
    } finally {
      stop(web.child);
      stop(api.child);
      await rm(dataDir, { recursive: true, force: true });
    }
  },
  baseURL: async ({ stack }, use) => use(stack.url),
});

export { expect } from '@playwright/test';
