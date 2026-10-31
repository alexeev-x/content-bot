import { listRecentPublications } from '../../modules/publishing';
import type { ChannelPost } from '../../modules/rubric-scheduler';
import { AUTOPUBLISH_ACTOR } from '../workflows/autopublish-source-event';
import { RUBRIC_ACTOR } from '../workflows/rubric-actor';
import type { Container } from '../container';

const LIVE = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'sent', 'unknown'];

/**
 * What stands in the rubric channel besides the scheduler's own slots (owner, 31.10.2026): the automatic news counts
 * against the day's limits; everything else there (the owner's posts, from the studio or by hand) only keeps the gap.
 * Our own posts not covered by a slot (the forecast has no slots) count like the news. Other channels count for nothing,
 * and a series (picture, then its poll) is one post.
 */
export async function channelPosts(
  container: Pick<Container, 'publicationOutcomes' | 'rubricChannelPosts'>,
  destination: { id: string; chatId: string },
  ours: ReadonlySet<string>,
  now: number,
  since: number
): Promise<ChannelPost[]> {
  const direct = await container.rubricChannelPosts.since(destination.chatId, since);
  const recent = await listRecentPublications({ repo: container.publicationOutcomes, now }, since);
  // A post the bot sent itself is never the owner's, whatever Telegram reports back about it.
  const ourMessages = new Set(
    recent.filter((row) => row.destinationId === destination.id).flatMap((row) => row.externalMessageIds)
  );
  const studio = recent
    .filter(
      (row) =>
        LIVE.includes(row.status) &&
        row.destinationId === destination.id &&
        !ours.has(row.postId) &&
        (row.seriesPosition ?? 1) === 1
    )
    .map((row): ChannelPost => ({
      at: row.at,
      weight: row.hasMedia ? 'V' : 'L',
      rubric: null,
      interactive: row.postKind === 'poll',
      family: null,
      ...(row.actor === AUTOPUBLISH_ACTOR || row.actor === RUBRIC_ACTOR ? {} : { owner: true })
    }));
  // Posts sent straight to the channel (the bot receives them as updates): only their time is known, so they keep the gap.
  return [
    ...studio,
    ...direct
      .filter((post) => !ourMessages.has(String(post.messageId)))
      .map((post): ChannelPost => ({
        at: post.at,
        weight: 'L',
        rubric: null,
        interactive: false,
        family: null,
        owner: true
      }))
  ];
}
