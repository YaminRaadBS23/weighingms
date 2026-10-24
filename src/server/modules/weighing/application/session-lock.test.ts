import { describe, expect, it } from 'vitest';
import { SessionLock } from './session-lock';

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
};

describe('SessionLock (ADR-6)', () => {
  it('runs operations of one session one after another, in arrival order', async () => {
    const lock = new SessionLock();
    const log: string[] = [];
    const first = gate();
    const a = lock.run('S', async () => {
      log.push('a:start');
      await first.promise;
      log.push('a:end');
    });
    const b = lock.run('S', async () => {
      log.push('b:start');
    });
    await Promise.resolve();
    expect(log).toEqual(['a:start']); // b waits
    first.open();
    await Promise.all([a, b]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('different sessions do not wait for each other', async () => {
    const lock = new SessionLock();
    const blocked = gate();
    const slow = lock.run('S1', () => blocked.promise);
    await expect(lock.run('S2', async () => 'done')).resolves.toBe('done');
    blocked.open();
    await slow;
  });

  it('a failing operation rejects its own caller but does not block the next one', async () => {
    const lock = new SessionLock();
    const failing = lock.run('S', async () => {
      throw new Error('boom');
    });
    const next = lock.run('S', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('returns the operation’s value', async () => {
    await expect(new SessionLock().run('S', async () => 42)).resolves.toBe(42);
  });
});
