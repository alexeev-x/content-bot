import { AI_LEXICON } from '../../modules/ai';
import { approvePost, updatePost } from '../../modules/content';
import type { SlotRow } from '../../modules/rubric-scheduler';
import { firstGuess, firstGuessLine } from '../../modules/rubrics';
import type { Container } from '../container';

/** What the answer's release reads: a slice of the tick's container (no import back into the tick). */
type GuessContainer = Pick<
  Container,
  'clock' | 'logger' | 'posts' | 'rubricSlots' | 'audience' | 'rubricAnalyticsSources'
>;
import { RUBRIC_ACTOR } from './rubric-actor';

// 04's answer just before it goes out (RUBRICS_SCHEDULER.md 4.2): the riddle's comments are read and the first one
// naming the hero puts «Первым угадал @ник» above the answer; then the answer, a draft until now, is approved. A
// failure to read the comments never holds the answer back: it goes out plain.

const COMMENTS_MAX = 500;

/** The numeric chat id of a destination's `chat_id` (numeric, or an @username the audience module knows). */
async function numericChat(
  container: Pick<GuessContainer, 'rubricAnalyticsSources'>,
  chatId: string
): Promise<number | null> {
  if (/^-?\d+$/.test(chatId)) return Number(chatId);
  const name = chatId.replace(/^@/, '').toLowerCase();
  const sources = container.rubricAnalyticsSources;
  return sources.channel === name ? await sources.channelChatId() : null;
}

async function guessLine(container: GuessContainer, slot: SlotRow, chatId: string): Promise<string | null> {
  const hero = slot.build?.guessHero;
  if (hero === undefined || !slot.dedupeKey.startsWith('follow:')) return null;
  const parent = await container.rubricSlots.byId(slot.dedupeKey.slice('follow:'.length));
  const riddle = Number(parent?.messageIds[0]);
  if (parent?.sentAt == null || !Number.isSafeInteger(riddle)) return null;
  const channelChatId = await numericChat(container, chatId);
  if (channelChatId === null) return null;
  const comments = await container.audience.threadComments({
    channelChatId,
    channelMessageId: riddle,
    since: parent.sentAt,
    limit: COMMENTS_MAX
  });
  const guess = firstGuess(
    AI_LEXICON,
    hero,
    comments.filter((comment) => comment.createdAt < slot.slotAt)
  );
  return guess.found ? firstGuessLine(guess) : null;
}

/** The slot as it is released: its answer approved (with the line when someone guessed). */
export async function prepareAnswer(container: GuessContainer, slot: SlotRow, chatId: string): Promise<SlotRow> {
  const post = slot.build?.posts[0];
  if (slot.kind !== 'follow_up' || slot.build?.guessHero === undefined || post === undefined) return slot;
  const now = container.clock.now();
  const current = await container.posts.findById(post.postId);
  if (current === null || current.status !== 'draft') return slot;

  let line: string | null = null;
  try {
    line = await guessLine(container, slot, chatId);
  } catch (error) {
    container.logger.warn({
      component: 'rubric-scheduler',
      operation: 'first-guess',
      status: 'skipped',
      errorCode: 'FIRST_GUESS_FAILED',
      detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown'
    });
  }
  let revision = post.revision;
  if (line !== null) {
    const body = `${line}\n\n${current.body}`;
    revision = (
      await updatePost(
        { repo: container.posts, now },
        { actor: RUBRIC_ACTOR, id: post.postId, input: { revision, body, entities: [] } }
      )
    ).revision;
  }
  const approved = await approvePost(
    { repo: container.posts, now },
    { actor: RUBRIC_ACTOR, id: post.postId, input: { revision } }
  );
  const build = { ...slot.build, posts: [{ ...post, revision: approved.revision }] };
  await container.rubricSlots.transition({ id: slot.id, from: 'ready', to: 'ready', now, set: { build } });
  return { ...slot, build };
}
