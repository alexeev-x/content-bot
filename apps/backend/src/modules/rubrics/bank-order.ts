// Rubric banks go out in a shuffled order without repeats (owner, 29.10.2026): a rubric's turn counter walks round
// after round, each round a new seeded shuffle of the bank.

/** A bank in round `round`'s order: a seeded shuffle, so every entry goes once before any repeats. */
export function shuffledOrder(round: number, size: number): number[] {
  let seed = (round + 1) * 0x9e3779b1;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: size }, (_, index) => index);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j] ?? i, order[i] ?? j];
  }
  return order;
}
