// A build of the game's files as the AI reads it (owner, 24.10.2026). The tracker's commit message names its build and
// files («6964 | 11 files | M\tgame/dota/pak01_dir/resource/localization/dota_english.txt, …»), so a build that
// touches nothing a player sees is passed over without reading its diff. Of the rest only the lines that changed are
// kept: an entry that only moved or only changed its spacing is no change (owner, 23.10.2026), and braces and bare
// block keys say nothing.

/** Heroes, abilities, items and neutral items; the English strings; the game's data tables; Valve's patch notes. */
const RELEVANT = [
  /(^|\/)pak01_dir\/scripts\/npc\//u,
  /(^|\/)pak01_dir\/resource\/localization\/[a-z_]*english\.txt$/u,
  /(^|\/)pak01_dir\/scripts\/[^/]+\.vdata$/u,
  /(^|\/)pak01_dir\/patchnotes\//u
];

export const isRelevantPath = (path: string) => RELEVANT.some((pattern) => pattern.test(path));

export interface BuildHeader {
  build: string;
  paths: string[];
  /**
   * Whether the message names every changed file. The tracker cuts its message at about 1 000 characters (QA
   * 24.10.2026: «334 files» named 25), and a big build lists binaries first: such a build is always read.
   */
  complete: boolean;
}

/** The build and the changed paths a tracker commit message names; null when it is not in the tracker's form. */
export function parseBuildMessage(message: string): BuildHeader | null {
  const [build = '', count = '', files = ''] = message.split('|').map((part) => part.trim());
  if (!/^\d{1,10}$/u.test(build)) return null;
  const total = Number(/^(\d{1,6}) files?$/u.exec(count)?.[1] ?? Number.NaN);
  const paths = files
    .split(/,\s*/u)
    .map((entry) => entry.replace(/^[A-Z]\s+/u, '').trim())
    .filter((path) => path !== '');
  return { build, paths, complete: Number.isFinite(total) && paths.length >= total };
}

/** Whether a build may touch what a player sees: a relevant file named, or a list cut short. */
export const mayMatter = (header: BuildHeader) => !header.complete || header.paths.some(isRelevantPath);

/** Per file and in all: enough for the writer to judge a build, never a whole localization dump. */
const FILE_MAX = 3_000;
const TOTAL_MAX = 14_000;
/** The queue job's own cap on the diff (app/bot/ai-job.ts): never passed, or the job would be refused unseen. */
const JOB_MAX = 15_500;

const normalize = (line: string) => line.trim().replace(/\s+/gu, ' ');
const SAYS_NOTHING = /^(?:[{}]|"\d+"|)$/u;

/** A file's changed lines, «- old» / «+ new», without moves, spacing changes and bare structure. */
export function changedLines(patch: string): string[] {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const sign = line[0];
    if (sign !== '+' && sign !== '-') continue;
    const text = normalize(line.slice(1));
    if (SAYS_NOTHING.test(text)) continue;
    (sign === '-' ? removed : added).push(text);
  }
  // A line both removed and added somewhere in the file only moved (or only changed its spacing).
  const left = new Map<string, number>();
  for (const text of removed) left.set(text, (left.get(text) ?? 0) + 1);
  const kept: string[] = [];
  for (const text of added) {
    const count = left.get(text) ?? 0;
    if (count > 0) left.set(text, count - 1);
    else kept.push(`+ ${text}`);
  }
  const gone = removed.filter((text) => {
    const count = left.get(text) ?? 0;
    if (count === 0) return false;
    left.set(text, count - 1);
    return true;
  });
  return [...gone.map((text) => `- ${text}`), ...kept];
}

/** The short name a file is shown under: «npc_dota_hero_marci», «dota_english». */
const shortName = (path: string) => (path.split('/').at(-1) ?? path).replace(/\.(txt|vdata)$/u, '');

/** The build's relevant changes as one text for the AI; null when nothing that changed is left. */
export function condenseBuild(files: readonly { filename: string; patch: string }[]): string | null {
  const parts: string[] = [];
  let total = 0;
  for (const file of files) {
    if (!isRelevantPath(file.filename)) continue;
    const lines = changedLines(file.patch);
    if (lines.length === 0) continue;
    let text = '';
    let shown = 0;
    for (const line of lines) {
      if (text.length + line.length + 1 > FILE_MAX) break;
      text += `${line}\n`;
      shown += 1;
    }
    if (shown < lines.length) text += `(ещё строк: ${lines.length - shown})\n`;
    const part = `# ${shortName(file.filename)}\n${text.trimEnd()}`;
    if (total + part.length > TOTAL_MAX) {
      parts.push('(остальные файлы не поместились)');
      break;
    }
    parts.push(part);
    total += part.length;
  }
  if (!parts.some((part) => part.startsWith('#'))) return null;
  return parts.join('\n\n').slice(0, JOB_MAX);
}

const FILE_START = 'diff --git a/';

/**
 * The relevant files of a build's unified diff, each with its hunks. Only the file headers are looked at to pass the
 * rest: a big build's diff is hundreds of KB of binaries' strings, and the Free plan gives a run 10 ms of CPU.
 */
export function splitDiff(diff: string): { filename: string; patch: string }[] {
  const files: { filename: string; patch: string }[] = [];
  let at = diff.startsWith(FILE_START) ? 0 : diff.indexOf(`\n${FILE_START}`);
  if (at > 0) at += 1;
  while (at !== -1) {
    const next = diff.indexOf(`\n${FILE_START}`, at);
    const end = next === -1 ? diff.length : next;
    const lineEnd = diff.indexOf('\n', at);
    const headerEnd = lineEnd === -1 || lineEnd > end ? end : lineEnd;
    const filename = diff.slice(at + FILE_START.length, headerEnd).split(' b/', 1)[0] ?? '';
    if (isRelevantPath(filename)) {
      const hunk = diff.indexOf('\n@@', headerEnd);
      if (hunk !== -1 && hunk < end) files.push({ filename, patch: diff.slice(hunk + 1, end) });
    }
    at = next === -1 ? -1 : next + 1;
  }
  return files;
}
