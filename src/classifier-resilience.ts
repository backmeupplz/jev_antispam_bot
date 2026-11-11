import { ClassifierRequestError, type JevSpamClassifier } from "./spam";

type Classifier = Pick<JevSpamClassifier, "classify">;

/**
 * Waits before the second and the third try of a classification that got no verdict (#625). A model call that times out
 * or fails in transport is tried again instead of keeping the message unchecked; the update keeps its place, so its
 * sender's later updates still wait for it. Each wait is spread by ±25% so calls that failed together retry apart.
 */
export const CLASSIFY_RETRY_DELAYS_MS: readonly number[] = [2_000, 6_000];

export function retryableClassification(error: unknown): error is ClassifierRequestError {
  return error instanceof ClassifierRequestError && error.retryable;
}

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); }
  signal?.addEventListener("abort", done, { once: true });
});

/** Tries `attempt` until it succeeds, fails for good, runs out of waits, or `signal` (the bot stopping) is aborted. */
export async function classifyWithRetries<T>(attempt: () => Promise<T>, {
  delaysMs = CLASSIFY_RETRY_DELAYS_MS,
  sleep = pause,
  random = Math.random,
  signal,
  onRetry,
}: {
  delaysMs?: readonly number[];
  sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  random?: () => number;
  signal?: AbortSignal;
  onRetry?: (failedAttempt: number, error: ClassifierRequestError, delayMs: number) => void;
} = {}): Promise<T> {
  for (let tried = 1; ; tried++) {
    try {
      return await attempt();
    } catch (error) {
      const delay = retryableClassification(error) ? delaysMs[tried - 1] : undefined;
      if (delay === undefined || signal?.aborted) throw error;
      const delayMs = Math.round(delay * (0.75 + random() / 2));
      onRetry?.(tried, error as ClassifierRequestError, delayMs);
      await sleep(delayMs, signal);
      // Shutdown confirms the update and exits within seconds: end with the failure rather than start a call it cuts off.
      if (signal?.aborted) throw error;
    }
  }
}

/** Successes in a row, all started at the current limit, before one more model call may run at once. */
export const RECOVER_AFTER = 20;
/** Timeouts in a row with one call at a time that pause model calls for PAUSE_MS: the model is down, not just slow. */
export const PAUSE_AFTER = 3;
export const PAUSE_MS = 30_000;

/**
 * Bounds the model calls in flight (#625). Laya runs JEV_CONCURRENCY single-threaded passes at once (#613); when the host's
 * CPU is saturated every pass slows down together, so four parallel calls all ran into the timeout at once and the passes
 * the bot had given up on kept the CPU busy. A timeout halves the calls allowed at once (down to one), once per generation:
 * calls started before the cut don't cut again. Each RECOVER_AFTER successes in a row add one back, up to `max`. Time spent
 * waiting here is not part of a call's timeout, which starts with its request.
 *
 * With one call at a time, PAUSE_AFTER timeouts in a row mean the model is down rather than slow: for PAUSE_MS every call
 * then fails at once as `paused` (not retried) instead of each update spending three timeouts in line, which would hold up
 * every other update, cache hits included. The first call after the pause probes the model again.
 */
export class AdaptiveClassifier implements Classifier {
  #limit: number;
  #running = 0;
  #waiting: (() => void)[] = [];
  #successes = 0;
  #generation = 0;
  #floorTimeouts = 0;
  #pausedUntil = 0;
  readonly #onLimit?: (limit: number, previous: number) => void;
  readonly #onPause?: (ms: number) => void;
  readonly #now: () => number;

  constructor(private readonly inner: Classifier, private readonly max: number, { onLimit, onPause, now = Date.now }: {
    onLimit?: (limit: number, previous: number) => void; onPause?: (ms: number) => void; now?: () => number;
  } = {}) {
    if (!Number.isInteger(max) || max < 1) throw new Error("max must be a positive integer");
    this.#limit = max;
    this.#onLimit = onLimit;
    this.#onPause = onPause;
    this.#now = now;
  }

  get limit() { return this.#limit; }
  get running() { return this.#running; }
  get waiting() { return this.#waiting.length; }
  get paused() { return this.#now() < this.#pausedUntil; }

  async classify(...args: Parameters<Classifier["classify"]>): ReturnType<Classifier["classify"]> {
    if (this.paused) throw this.#pausedError();
    if (this.#running < this.#limit && !this.#waiting.length) this.#running++;
    else await new Promise<void>(resolve => this.#waiting.push(resolve));
    const generation = this.#generation;
    try {
      // Calls that queued before the pause fail with it too.
      if (this.paused) throw this.#pausedError();
      const result = await this.inner.classify(...args);
      this.#floorTimeouts = 0;
      if (generation === this.#generation && ++this.#successes >= RECOVER_AFTER && this.#limit < this.max) this.#set(this.#limit + 1);
      return result;
    } catch (error) {
      if (error instanceof ClassifierRequestError && error.reason === "timeout" && generation === this.#generation) {
        if (this.#limit > 1) this.#set(Math.ceil(this.#limit / 2));
        else {
          this.#successes = 0;
          if (++this.#floorTimeouts >= PAUSE_AFTER) {
            this.#floorTimeouts = 0;
            this.#pausedUntil = this.#now() + PAUSE_MS;
            this.#onPause?.(PAUSE_MS);
          }
        }
      }
      throw error;
    } finally {
      this.#running--;
      this.#admit();
    }
  }

  #pausedError() {
    return new ClassifierRequestError("Model calls are paused after repeated timeouts", "paused");
  }

  #set(limit: number) {
    const previous = this.#limit;
    this.#limit = limit;
    this.#successes = 0;
    this.#generation++;
    this.#onLimit?.(limit, previous);
    this.#admit();
  }

  // Hands free slots to waiters in arrival order; `running` counts them as soon as they are admitted.
  #admit() {
    while (this.#waiting.length && this.#running < this.#limit) {
      this.#running++;
      this.#waiting.shift()!();
    }
  }
}
