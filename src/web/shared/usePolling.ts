import { useEffect, useRef } from 'react';

/**
 * Calls `fn` immediately and then every `intervalMs` while `enabled`, never overlapping calls.
 * Stops on unmount.
 */
export function usePolling(fn: () => Promise<void> | void, intervalMs: number, enabled = true) {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        await latest.current();
      } finally {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [intervalMs, enabled]);
}
