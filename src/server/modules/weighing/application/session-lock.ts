/**
 * Runs async operations on one weighing session one after another (ADR-6). Operations on different
 * sessions are independent; reads do not take the lock.
 */
export class SessionLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const tail = result.catch(() => undefined);
    this.tails.set(sessionId, tail);
    void tail.then(() => {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
    });
    return result;
  }
}
