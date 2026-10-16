import type { AiItemScriptDto, AiReelsScriptDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { ApprovedScriptRow, ScriptLinksRepository } from './d1-script-links-repository';

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

export async function readItemScript(deps: ScriptLinkDeps, video: LinkedVideo): Promise<AiItemScriptDto> {
  if (video.platform === 'telegram') return { linked: null, candidates: [] };
  const linked = await deps.links.linkOf(video.id);
  if (linked !== null) return { linked: toDto(linked), candidates: [] };
  const rows = await deps.links.approvedScripts({
    from: video.publishedAt - BEFORE_MS,
    to: video.publishedAt + AFTER_MS,
    limit: SCAN
  });
  return { linked: null, candidates: rank(video, rows).slice(0, CANDIDATES).map(toDto) };
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
  return { linked: toDto(script), candidates: [] };
}

export async function unlinkItemScript(deps: ScriptLinkDeps, video: LinkedVideo): Promise<AiItemScriptDto> {
  await deps.links.unlink(video.id);
  return readItemScript(deps, video);
}
