export declare const WARMUP_IDLE_TIMEOUT_MS: number;
export declare const WARMUP_FALLBACK_DELAY_MS: number;

/**
 * Host surface the scheduler needs — a structural subset of Window, so tests
 * can inject a fake and non-browser hosts type-check.
 */
export interface WarmupHost {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (id: number) => void;
}

/** Schedule `task` after the initial UI work; returns a cancel function. */
export declare function scheduleWarmup(
  task: () => void,
  host?: WarmupHost,
): () => void;
