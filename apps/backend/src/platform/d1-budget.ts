// Counts what one Worker invocation spends on D1. The Free plan allows 50 subrequests per invocation and
// every statement of a batch counts, so long-running work asks `remaining()` before starting a unit of work
// and stops (leaving it to the next Cron tick) instead of being cut off half way.
export interface QueryBudget {
  readonly limit: number;
  used(): number;
  remaining(): number;
  /** Counts a call that is not D1 (a Telegram request, an R2 write) against the same allowance. */
  charge(count: number): void;
}

export const SUBREQUEST_LIMIT = 50;

export function meterD1(db: D1Database, limit: number = SUBREQUEST_LIMIT): { db: D1Database; budget: QueryBudget } {
  let used = 0;
  const budget: QueryBudget = {
    limit,
    used: () => used,
    remaining: () => Math.max(0, limit - used),
    charge: (count) => {
      used += count;
    }
  };
  // A batch must hand D1 its own statement objects, so each wrapper remembers the one it stands for.
  const originals = new WeakMap<object, D1PreparedStatement>();

  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped: D1PreparedStatement = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
        if (property === 'run' || property === 'all' || property === 'first' || property === 'raw') {
          return (...args: unknown[]) => {
            used += 1;
            return (target[property] as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          };
        }
        const value = Reflect.get(target, property) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      }
    });
    originals.set(wrapped, statement);
    return wrapped;
  };

  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          used += statements.length;
          return target.batch(statements.map((statement) => originals.get(statement) ?? statement));
        };
      }
      if (property === 'exec') {
        return (sql: string) => {
          used += 1;
          return target.exec(sql);
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    }
  });

  return { db: proxy, budget };
}
