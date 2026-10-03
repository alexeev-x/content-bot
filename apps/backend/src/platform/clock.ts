// Domain and use cases receive a Clock; they never call Date.now() themselves.
export interface Clock {
  /** UTC epoch milliseconds. */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
