// Summarizes .agent-metrics/sessions/*.json (written by the log-usage hook) for A/B comparisons.
// Relative cost units: fresh input 1, cache write 1.25, cache read 0.1, output 5 — check current
// rates on the pricing page of the model you used before turning units into money.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEIGHTS = {
  input_tokens: 1,
  cache_creation_input_tokens: 1.25,
  cache_read_input_tokens: 0.1,
  output_tokens: 5,
};
export const units = (u) => Object.entries(WEIGHTS).reduce((s, [k, w]) => s + (u[k] ?? 0) * w, 0);

export function summarize(session) {
  const parts = [session.main, ...Object.values(session.subagents ?? {})];
  const total = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, parts.reduce((s, p) => s + (p[k] ?? 0), 0)]));
  return {
    id: session.session_id,
    branch: session.branch,
    updated: session.updated,
    subagents: parts.length - 1,
    ...total,
    units: Math.round(units(total)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(fileURLToPath(import.meta.url), '../../../.agent-metrics/sessions');
  if (!existsSync(dir)) {
    console.log('No sessions recorded yet (.agent-metrics/sessions).');
    process.exit(0);
  }
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => summarize(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  rows.sort((a, b) => a.updated.localeCompare(b.updated));
  console.table(
    rows.map((r) => ({
      session: r.id.slice(0, 8),
      branch: r.branch,
      subagents: r.subagents,
      output: r.output_tokens,
      cache_read: r.cache_read_input_tokens,
      cache_write: r.cache_creation_input_tokens,
      input: r.input_tokens,
      units: r.units,
    })),
  );
}
