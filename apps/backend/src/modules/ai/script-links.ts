import {
  AI_CHAIN_TASK_MAX,
  AI_CHAIN_TEXT_MAX,
  AI_CHANGED_PARTS,
  AI_UNLINKED_DAYS,
  AI_UNLINKED_LIMIT,
  type AiChainWarning,
  type AiItemScriptDto,
  type AiReelsScriptDto,
  type AiScriptChainDto,
  type AiUnlinkedScriptsDto
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { ApprovedScriptRow, ScriptChainRow, ScriptLinksRepository } from './d1-script-links-repository';

// A published video ↔ the approved AI script it was filmed from (docs/ai/architecture.md, item 3). Reels go out
// outside the studio, so the studio only proposes; the link exists once the owner confirms it.

const DAY_MS = 86_400_000;
/** A script is filmed and published within two weeks of its approval; a little after covers clock skew. */
const BEFORE_MS = 14 * DAY_MS;
const AFTER_MS = 60 * 60 * 1000;
const SCAN = 30;
const CANDIDATES = 3;
const EXCERPT = 200;

export interface ScriptLinkDeps {
  links: ScriptLinksRepository;
  clock: Clock;
}

/** The video as the analytics module knows it; the route reads it there. */
export interface LinkedVideo {
  id: string;
  platform: 'telegram' | 'youtube' | 'tiktok';
  title: string;
  publishedAt: number;
}

function toDto(row: ApprovedScriptRow): AiReelsScriptDto {
  const text = row.text.replace(/\s+/g, ' ').trim();
  return {
    revisionId: row.revisionId,
    format: row.format,
    excerpt: text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1)}…` : text,
    approvedAt: new Date(row.approvedAt).toISOString()
  };
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replaceAll('ё', 'е')
      .split(/[^a-zа-я0-9]+/)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 6))
  );
}

/** Shared title words first, then the closest approval before the video. */
function rank(video: LinkedVideo, rows: readonly ApprovedScriptRow[]): ApprovedScriptRow[] {
  const title = words(video.title);
  const score = (row: ApprovedScriptRow) => [...words(row.text)].filter((word) => title.has(word)).length;
  return [...rows]
    .map((row) => ({ row, score: score(row), gap: Math.abs(video.publishedAt - row.approvedAt) }))
    .sort((a, b) => b.score - a.score || a.gap - b.gap)
    .map(({ row }) => row);
}

function parts(stored: string | null): AiScriptChainDto['changedParts'] {
  if (stored === null) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return AI_CHANGED_PARTS.filter((part) => parsed.includes(part));
  } catch {
    return [];
  }
}

function toChain(row: ScriptChainRow, video: LinkedVideo): AiScriptChainDto {
  const warnings: AiChainWarning[] = [];
  if (row.approvedAt > video.publishedAt) warnings.push('approved_after_video');
  else if (video.publishedAt - row.approvedAt > BEFORE_MS) warnings.push('approved_long_before');
  return {
    task: row.task.slice(0, AI_CHAIN_TASK_MAX),
    model: row.model,
    packRevision: row.packRevision,
    // Never the approved text in its place: the chain shows only what was stored.
    draft: row.draft === null ? null : row.draft.slice(0, AI_CHAIN_TEXT_MAX),
    approved: row.approved.slice(0, AI_CHAIN_TEXT_MAX),
    editRatio: row.editRatio,
    changedParts: parts(row.changedParts),
    draftedAt: new Date(row.draftedAt).toISOString(),
    otherItems: row.otherItems,
    warnings
  };
}

async function linkedResult(
  deps: ScriptLinkDeps,
  video: LinkedVideo,
  script: ApprovedScriptRow
): Promise<AiItemScriptDto> {
  const chain = await deps.links.chainOf({ revisionId: script.revisionId, itemId: video.id });
  return { linked: toDto(script), candidates: [], chain: chain === null ? null : toChain(chain, video) };
}

/** Approved Reels scripts of the last AI_UNLINKED_DAYS days that no video is linked to. */
export async function readUnlinkedScripts(deps: ScriptLinkDeps): Promise<AiUnlinkedScriptsDto> {
  const rows = await deps.links.unlinkedScripts({
    from: deps.clock.now() - AI_UNLINKED_DAYS * DAY_MS,
    limit: AI_UNLINKED_LIMIT
  });
  return { items: rows.map(toDto) };
}

export async function readItemScript(deps: ScriptLinkDeps, video: LinkedVideo): Promise<AiItemScriptDto> {
  if (video.platform === 'telegram') return { linked: null, candidates: [], chain: null };
  const linked = await deps.links.linkOf(video.id);
  if (linked !== null) return linkedResult(deps, video, linked);
  const rows = await deps.links.approvedScripts({
    from: video.publishedAt - BEFORE_MS,
    to: video.publishedAt + AFTER_MS,
    limit: SCAN
  });
  return { linked: null, candidates: rank(video, rows).slice(0, CANDIDATES).map(toDto), chain: null };
}

export async function linkItemScript(
  deps: ScriptLinkDeps,
  video: LinkedVideo,
  revisionId: string
): Promise<AiItemScriptDto> {
  if (video.platform === 'telegram') {
    throw new AppError('VALIDATION_ERROR', 'Only a video is linked to a script', { reason: 'NOT_A_VIDEO' });
  }
  const script = await deps.links.findScript(revisionId);
  if (script === null) throw new AppError('NOT_FOUND', 'No such approved Reels script');
  await deps.links.link({ itemId: video.id, revisionId, now: deps.clock.now() });
  return linkedResult(deps, video, script);
}

export async function unlinkItemScript(deps: ScriptLinkDeps, video: LinkedVideo): Promise<AiItemScriptDto> {
  await deps.links.unlink(video.id);
  return readItemScript(deps, video);
}
