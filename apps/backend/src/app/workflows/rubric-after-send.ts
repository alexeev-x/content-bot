import { RUBRIC_META, type RubricKey } from '../../modules/rubrics';
import { type SlotRow } from '../../modules/rubric-scheduler';
import { mskParts } from '../../shared/msk-time';
import type { Container } from '../container';
import { rehearsalPace, schedulerMode } from '../rubric-scheduler/runtime';

// What follows a rubric post that went out (area-backend-core §11.2): its poll is registered with the audience module
// and gets a `poll_close` slot at its close time (24 h polls, 7-day quizzes and bets); a «Кого понерфят?» bet opens,
// its result closes it. Each step is idempotent: a repeated read-back changes nothing.

const HOUR_MS = 3_600_000;
/** The week-long DEV test closes polls and answers riddles sooner, so a week sees many of them. */
const REHEARSAL_POLL_HOURS = 2;
const REHEARSAL_FOLLOW_UP_MINUTES = 60;

type AfterSendContainer = Pick<
  Container,
  'audience' | 'rubricSlots' | 'rubricBets' | 'newId' | 'clock' | 'logger' | 'schedulerEnv'
>;

export async function afterSlotSent(
  container: AfterSendContainer,
  slot: SlotRow,
  sent: { at: number; pollId: string | null; messageIds: string[]; chatId: string | null }
): Promise<void> {
  const meta = RUBRIC_META[slot.rubricKey as RubricKey];
  const now = container.clock.now();
  const rehearsing = rehearsalPace(container.schedulerEnv, schedulerMode(container.schedulerEnv)) !== null;
  const chatId = sent.chatId === null ? NaN : Number(sent.chatId);
  // The poll is the last message of the post (a picture, then its poll).
  const pollMessage = Number(sent.messageIds.at(-1));
  if (
    sent.pollId !== null &&
    meta?.poll !== undefined &&
    Number.isSafeInteger(chatId) &&
    Number.isSafeInteger(pollMessage)
  ) {
    const closesAt = sent.at + (rehearsing ? REHEARSAL_POLL_HOURS : meta.poll.closeAfterHours) * HOUR_MS;
    await container.audience
      .registerPoll({ pollId: sent.pollId, chatId, messageId: pollMessage, publishedAt: sent.at, closesAt })
      .catch((error: unknown) =>
        container.logger.warn({
          component: 'rubric-after-send',
          operation: 'register_poll',
          errorCode: 'POLL_REGISTER_FAILED',
          detail: error instanceof Error ? error.name : 'unknown'
        })
      );
    await container.rubricSlots.insert(
      [
        {
          id: container.newId(),
          mskDay: mskParts(closesAt).day,
          slotAt: closesAt,
          kind: 'poll_close',
          rubricKey: slot.rubricKey,
          candidates: [slot.rubricKey],
          candIdx: 0,
          attempt: 0,
          status: 'planned',
          buildAt: closesAt,
          nextActionAt: closesAt,
          // stopPoll is safe to repeat: tried for a day, then the poll is left as Telegram has it.
          deadlineAt: closesAt + 24 * HOUR_MS,
          weight: slot.weight,
          interactive: false,
          family: slot.family,
          dedupeKey: `poll_close:${slot.id}`,
          reason: { kind: 'poll_close', text: 'Закрыть опрос' },
          createdAt: now
        }
      ],
      now
    );
    const closeSlot = (await container.rubricSlots.ofRubric(slot.rubricKey, 10)).find(
      (each) => each.dedupeKey === `poll_close:${slot.id}`
    );
    if (closeSlot !== undefined && closeSlot.facts === null)
      await container.rubricSlots.transition({
        id: closeSlot.id,
        from: closeSlot.status,
        to: closeSlot.status,
        now,
        set: { facts: { chatId: sent.chatId, messageId: pollMessage, pollId: sent.pollId, parent: slot.id } }
      });
  }

  // A follow-up (04's answer) goes `afterMinutes` after the first post really went out; a taken minute moves it on by
  // ten, at most six times.
  const followUp = slot.build?.followUp;
  if (followUp !== undefined && slot.kind !== 'follow_up') {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const after = rehearsing ? REHEARSAL_FOLLOW_UP_MINUTES : followUp.afterMinutes;
      const at = Math.ceil((sent.at + after * 60_000) / 60_000) * 60_000 + attempt * 10 * 60_000;
      const id = container.newId();
      const inserted = await container.rubricSlots.insert(
        [
          {
            id,
            mskDay: mskParts(at).day,
            slotAt: at,
            kind: 'follow_up',
            rubricKey: slot.rubricKey,
            candidates: [slot.rubricKey],
            candIdx: 0,
            attempt: 0,
            status: 'ready',
            buildAt: sent.at,
            nextActionAt: at - 60_000,
            deadlineAt: at + 4 * 60_000,
            weight: slot.weight,
            interactive: false,
            family: slot.family,
            dedupeKey: `follow:${slot.id}`,
            reason: { kind: 'follow_up', text: 'Ответ на загадку' },
            createdAt: now
          }
        ],
        now
      );
      if (inserted === 1) {
        await container.rubricSlots.transition({
          id,
          from: 'ready',
          to: 'ready',
          now,
          set: {
            build: followBuild(followUp),
            postId: followUp.posts[0]?.postId ?? null
          }
        });
        break;
      }
      // The dedupe key taken means an earlier run already made it; if it died before filling the build, fill it now.
      if ((await container.rubricSlots.taken([`follow:${slot.id}`])).size > 0) {
        const made = (await container.rubricSlots.ofRubric(slot.rubricKey, 20)).find(
          (each) => each.dedupeKey === `follow:${slot.id}`
        );
        if (made !== undefined && made.status === 'ready' && made.build === null)
          await container.rubricSlots.transition({
            id: made.id,
            from: 'ready',
            to: 'ready',
            now,
            set: { build: followBuild(followUp), postId: followUp.posts[0]?.postId ?? null }
          });
        break;
      }
    }
  }

  // «Кого понерфят?»: the bet opens when its poll is out, and closes when its result is.
  if (slot.dedupeKey.startsWith('bet:')) {
    const facts = slot.facts ?? {};
    await container.rubricBets.place({
      id: container.newId(),
      chain: typeof facts['chain'] === 'string' ? facts['chain'] : slot.dedupeKey.slice('bet:'.length),
      heroIds: Array.isArray(facts['heroIds']) ? (facts['heroIds'] as number[]) : [],
      postSlotId: slot.id,
      pollId: sent.pollId,
      form: 'picture',
      now
    });
  }
  if (slot.dedupeKey.startsWith('bet-result:')) {
    const bet = await container.rubricBets.open();
    if (bet !== null) {
      const votes = bet.pollId === null ? null : await container.audience.pollState(bet.pollId).catch(() => null);
      await container.rubricBets.resolve({ id: bet.id, resultSlotId: slot.id, votes: votes?.options ?? null, now });
    }
  }
}

function followBuild(followUp: NonNullable<NonNullable<SlotRow['build']>['followUp']>): NonNullable<SlotRow['build']> {
  return {
    posts: followUp.posts,
    degradations: [],
    hasPicture: true,
    hasPoll: false,
    bankTurn: null,
    ...(followUp.guessHero === undefined ? {} : { guessHero: followUp.guessHero })
  };
}
