export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a function that resolves when the next request may start, keeping
 * at least minIntervalMs between starts. Qloo's hackathon limit is 5 per second.
 */
export function createSpacer(minIntervalMs: number, sleep: Sleep = realSleep, now: () => number = Date.now) {
  let nextStart = 0;
  let chain: Promise<void> = Promise.resolve();
  return function waitForTurn(): Promise<void> {
    const turn = chain.then(async () => {
      const wait = nextStart - now();
      if (wait > 0) await sleep(wait);
      nextStart = now() + minIntervalMs;
    });
    chain = turn.catch(() => undefined);
    return turn;
  };
}
