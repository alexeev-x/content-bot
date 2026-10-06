// A D1 binding that counts what one invocation spends: round trips (a batch is one), statements
// (every statement of a batch), and the rows D1 reports as read. `first()` returns a bare row, so
// its rows_read is not visible here; the dispatcher's own reads use all()/batch().
export interface Meter {
  roundTrips: number;
  statements: number;
  rowsRead: number;
  /** Every statement text prepared, in order. */
  sql: string[];
}

export function meteredDb(db: D1Database): { db: D1Database; meter: Meter } {
  const meter: Meter = { roundTrips: 0, statements: 0, rowsRead: 0, sql: [] };
  const real = new WeakMap<object, D1PreparedStatement>();

  const tap = <T>(result: T): T => {
    const results = Array.isArray(result) ? result : [result];
    for (const entry of results) {
      const meta = (entry as { meta?: { rows_read?: number } } | null)?.meta;
      meter.rowsRead += meta?.rows_read ?? 0;
    }
    return result;
  };

  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
        if (property === 'run' || property === 'all' || property === 'first' || property === 'raw') {
          return (...args: unknown[]) => {
            meter.roundTrips += 1;
            meter.statements += 1;
            return (target[property] as (...a: unknown[]) => Promise<unknown>)(...args).then(tap);
          };
        }
        return Reflect.get(target, property) as unknown;
      }
    });
    real.set(wrapped, statement);
    return wrapped;
  };

  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (sql: string) => {
          meter.sql.push(sql);
          return wrap(target.prepare(sql));
        };
      }
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          meter.roundTrips += 1;
          meter.statements += statements.length;
          return target.batch(statements.map((statement) => real.get(statement) ?? statement)).then(tap);
        };
      }
      return Reflect.get(target, property) as unknown;
    }
  });
  return { db: proxy, meter };
}
