/**
 * One reconcile per project at a time, throttled unless forced — the
 * scheduling shared by the drawing-set and specification syncs. Each sync gets
 * its own instance, kept on `globalThis` (like the repositories) so dev hot
 * reload and separate route bundles share it.
 */

/** Minimum time between reconciles of one project that nothing forced. */
export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

type SyncState<R> = {
  running: Map<string, Promise<R | null>>;
  /** A forced run was asked for while one was running: run again after it. */
  again: Set<string>;
  lastRun: Map<string, number>;
};

export type ReconcileScheduler<D, R> = {
  /** True while a reconcile of the project is running on this instance. */
  isSyncing(projectNumber: string): boolean;
  /**
   * Runs the reconcile unless one ran recently (`force` skips that check: a
   * push from ccr, or "Check for updates"). Never throws: a failure is logged
   * and reported as null, and the next request retries.
   */
  schedule(
    deps: () => D,
    projectNumber: string,
    options?: { force?: boolean; nowMs?: number },
  ): Promise<R | null>;
  /** For tests: forget every throttle and run. */
  reset(): void;
};

export function createReconcileScheduler<D, R>(
  globalKey: string,
  label: string,
  reconcile: (deps: D, projectNumber: string) => Promise<R>,
): ReconcileScheduler<D, R> {
  const store = globalThis as unknown as Record<string, SyncState<R> | undefined>;
  const state = (): SyncState<R> => {
    store[globalKey] ??= { running: new Map(), again: new Set(), lastRun: new Map() };
    return store[globalKey]!;
  };

  return {
    isSyncing: (projectNumber) => state().running.has(projectNumber),
    reset: () => {
      store[globalKey] = undefined;
    },
    schedule(deps, projectNumber, { force = false, nowMs = Date.now() } = {}) {
      const s = state();
      const running = s.running.get(projectNumber);
      if (running) {
        if (force) s.again.add(projectNumber);
        return running;
      }
      const last = s.lastRun.get(projectNumber);
      if (!force && last !== undefined && nowMs - last < RECONCILE_INTERVAL_MS) return Promise.resolve(null);

      s.lastRun.set(projectNumber, nowMs);
      const run = (async (): Promise<R | null> => {
        let result: R | null = null;
        do {
          s.again.delete(projectNumber);
          try {
            result = await reconcile(deps(), projectNumber);
          } catch (error) {
            // Try again on the next request rather than waiting out the interval.
            s.lastRun.delete(projectNumber);
            console.error(`[CA] ${label} for ${projectNumber} failed:`, error instanceof Error ? error.message : error);
            result = null;
          }
        } while (s.again.has(projectNumber));
        return result;
      })().finally(() => s.running.delete(projectNumber));
      s.running.set(projectNumber, run);
      return run;
    },
  };
}
