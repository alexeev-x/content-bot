import type { Clock } from '../../platform/clock';
import type {
  ApprovedScriptRow,
  ScriptLinksRepository,
  ScriptPromptRow,
  ScriptPromptStatus
} from './d1-script-links-repository';

// Linking a published video to the approved script it was filmed from, without the studio (owner, 19.10.2026:
// the analytics must see every video's hook). A confident match is linked by the Worker and reported with an
// undo button; any other match is asked in the bot once, one candidate at a time. One video is one title: the
// owner posts it on YouTube and TikTok, and an answer links both.

const DAY_MS = 86_400_000;
/** A script is filmed and published within two weeks of its approval; a little after covers clock skew. */
const BEFORE_MS = 14 * DAY_MS;
const AFTER_MS = 60 * 60 * 1000;
const SCAN = 20;
const CANDIDATES = 3;
/** Confident: at least this many shared title words, and this many more than the runner-up. */
const AUTO_MIN_WORDS = 3;
const AUTO_MARGIN = 2;
/** New prompts per Cron tick: each is one message to the owner. */
const PROMPTS_PER_TICK = 2;

export interface VideoForScript {
  /** The normalized title: the same video on both platforms. */
  groupKey: string;
  title: string;
  publishedAt: number;
  itemIds: string[];
}

export type ScriptProposal =
  | { kind: 'auto'; promptId: string; video: VideoForScript; script: ApprovedScriptRow; matched: string[] }
  | { kind: 'ask'; promptId: string; video: VideoForScript; script: ApprovedScriptRow };

export interface ScriptPromptDeps {
  links: ScriptLinksRepository;
  clock: Clock;
  newId: () => string;
}

/** «Как я на Оракле играл | Учусь играть в доту» and its TikTok copy give one key. */
export function scriptGroupKey(title: string): string {
  return title
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/#\S+/g, ' ')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

// The rubric's own words are in every title and script of the rubric, and these words in nearly any text: they
// tell nothing about which script a video was filmed from (review 19.10.2026: «почему … фидить в доту» matched).
const RUBRIC = /уч[ую]\s*фидить|учусь\s*играть|в\s*дот[уеа]|часть\s*\d+|#?shorts/g;
const GENERIC = new Set(
  'почему потому только сегодня теперь просто очень всегда никогда когда который которая которые этого этому такой такая такие будет можно нужно вообще ещё снова опять играл играть играю игре игра катка катку доту доте дота'
    .split(' ')
    .map((word) => word.slice(0, 6))
);

function stems(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replace(RUBRIC, ' ')
      .split(/[^a-zа-я0-9]+/)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 6))
      .filter((stem) => !GENERIC.has(stem))
  );
}

/** The candidates by shared title words, then by the closest approval before the video. */
function ranked(video: VideoForScript, rows: readonly ApprovedScriptRow[]) {
  const title = stems(video.title);
  return rows
    .map((row) => {
      const matched = [...stems(row.text)].filter((stem) => title.has(stem));
      return { row, matched, gap: Math.abs(video.publishedAt - row.approvedAt) };
    })
    .sort((a, b) => b.matched.length - a.matched.length || a.gap - b.gap);
}

/**
 * The new videos' proposals of this tick: each video is handled once (its prompt row), a video already linked
 * by hand is left alone, and one without any script approved before it is closed with no message.
 */
export async function proposeScriptLinks(
  deps: ScriptPromptDeps,
  videos: readonly VideoForScript[]
): Promise<ScriptProposal[]> {
  const now = deps.clock.now();
  const prompts = await deps.links.promptsAmong(videos.map((video) => video.groupKey));
  const linked = await deps.links.linkedAmong(videos.flatMap((video) => video.itemIds));
  const proposals: ScriptProposal[] = [];
  // Every video handled counts: a closed one costs its statements too (review 19.10.2026).
  let handled = 0;
  for (const video of videos) {
    if (handled >= PROMPTS_PER_TICK) break;
    const prompt = prompts.get(video.groupKey);
    if (prompt !== undefined) {
      // The copy on the other platform, collected after the prompt, joins it (and its script, if linked).
      const late = video.itemIds.filter((id) => !prompt.itemIds.includes(id));
      if (late.length > 0) {
        await deps.links.addPromptItems({ id: prompt.id, itemIds: late, now });
        handled += 1;
      }
      continue;
    }
    if (video.itemIds.some((id) => linked.has(id))) continue;
    handled += 1;
    const rows = await deps.links.approvedScripts({
      from: video.publishedAt - BEFORE_MS,
      to: video.publishedAt + AFTER_MS,
      limit: SCAN
    });
    const order = ranked(video, rows);
    const [top, second] = order;
    const promptId = deps.newId();
    if (top === undefined) {
      await deps.links.createPrompt({
        id: promptId,
        groupKey: video.groupKey,
        title: video.title,
        itemIds: video.itemIds,
        candidates: [],
        status: 'asked',
        revisionId: null,
        now
      });
      // Nothing to ask about: closed at once, so the next tick does not look again.
      await deps.links.answerPrompt({
        id: promptId,
        from: 'asked',
        to: 'none',
        revisionId: null,
        itemIds: [],
        link: 'keep',
        now
      });
      continue;
    }
    const confident =
      top.matched.length >= AUTO_MIN_WORDS &&
      (second === undefined || top.matched.length - second.matched.length >= AUTO_MARGIN);
    const created = await deps.links.createPrompt({
      id: promptId,
      groupKey: video.groupKey,
      title: video.title,
      itemIds: video.itemIds,
      candidates: order.slice(0, CANDIDATES).map((candidate) => candidate.row.revisionId),
      status: confident ? 'auto' : 'asked',
      revisionId: confident ? top.row.revisionId : null,
      now
    });
    if (!created) continue;
    proposals.push(
      confident
        ? { kind: 'auto', promptId, video, script: top.row, matched: top.matched }
        : { kind: 'ask', promptId, video, script: top.row }
    );
  }
  return proposals;
}

export type ScriptPromptAnswer =
  | { kind: 'linked'; title: string; script: ApprovedScriptRow }
  | { kind: 'next'; prompt: ScriptPromptRow; script: ApprovedScriptRow; index: number }
  | { kind: 'confirmed'; title: string }
  | { kind: 'no_more' | 'none' | 'undone' | 'stale' | 'gone' };

/**
 * One tap on a prompt: «Да» links the candidate on screen, «Другой» shows the next one, «Без сценария» closes it,
 * «Не тот» removes an automatic link. A tap on a prompt someone changed since answers `stale` and changes nothing.
 */
export async function answerScriptPrompt(
  deps: Omit<ScriptPromptDeps, 'newId'>,
  input: { promptId: string; action: 'yes' | 'other' | 'none' | 'undo' | 'confirm'; index: number }
): Promise<ScriptPromptAnswer> {
  const prompt = await deps.links.findPrompt(input.promptId);
  if (prompt === null) return { kind: 'gone' };
  const now = deps.clock.now();
  const move = (
    from: ScriptPromptStatus,
    to: ScriptPromptStatus,
    extra: Partial<Parameters<ScriptLinksRepository['answerPrompt']>[0]>
  ) =>
    deps.links.answerPrompt({
      id: prompt.id,
      from,
      to,
      revisionId: null,
      itemIds: prompt.itemIds,
      link: 'keep',
      now,
      ...extra
    });
  if (input.action === 'confirm') {
    // «✅ Верно» under an automatic link: the owner confirms it, so it may teach analysis rules (review 19.10.2026).
    if (prompt.status !== 'auto' || prompt.revisionId === null) return { kind: 'stale' };
    const script = await deps.links.findScript(prompt.revisionId);
    if (script === null) return { kind: 'stale' };
    return (await move('auto', 'linked', { revisionId: prompt.revisionId, link: 'confirm' }))
      ? { kind: 'confirmed', title: prompt.title }
      : { kind: 'stale' };
  }
  if (input.action === 'undo') {
    if (prompt.status !== 'auto' || prompt.revisionId === null) return { kind: 'stale' };
    return (await move('auto', 'undone', { revisionId: prompt.revisionId, link: 'remove' }))
      ? { kind: 'undone' }
      : { kind: 'stale' };
  }
  if (prompt.status !== 'asked' || prompt.shown !== input.index) return { kind: 'stale' };
  if (input.action === 'none')
    return (await move('asked', 'none', { shown: input.index })) ? { kind: 'none' } : { kind: 'stale' };
  if (input.action === 'yes') {
    const revisionId = prompt.candidates[input.index];
    const script = revisionId === undefined ? null : await deps.links.findScript(revisionId);
    if (script === null) return { kind: 'stale' };
    return (await move('asked', 'linked', { shown: input.index, revisionId: script.revisionId, link: 'set' }))
      ? { kind: 'linked', title: prompt.title, script }
      : { kind: 'stale' };
  }
  const next = input.index + 1;
  const revisionId = prompt.candidates[next];
  const script = revisionId === undefined ? null : await deps.links.findScript(revisionId);
  if (script === null) return { kind: 'no_more' };
  return (await move('asked', 'asked', { shown: input.index, nextShown: next }))
    ? { kind: 'next', prompt: { ...prompt, shown: next }, script, index: next }
    : { kind: 'stale' };
}
