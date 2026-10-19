import { answerScriptPrompt, proposeScriptLinks, scriptGroupKey, type VideoForScript } from '../../modules/ai';
import type {
  ContentAlertRepository,
  ContentAnalyticsRepository,
  NewContentAlert
} from '../../modules/content-analytics';
import type { Clock } from '../../platform/clock';
import type { ScriptLinksRepository } from '../../modules/ai';
import { escapeHtml } from '../notifications/notice-template';

// Each new video gets its approved script (owner, 19.10.2026: the daily review must see the hook): the ai module
// decides, this workflow turns the decision into an owner message through the content alerts (one attempt,
// `unknown` never resent) and a tap on its buttons into the link. Callback data: `sl:<prompt id>:<y|o|x|u>:<i>`.

const HOUR_MS = 60 * 60 * 1000;
/** Videos this young are looked at; an older one was posted before this feature or has its answer. */
const RECENT_MS = 72 * HOUR_MS;
const RECENT_PER_PLATFORM = 6;
const EXCERPT = 220;
/** A prompt whose message did not go in is raised again within this long. */
const MESSAGE_RETRY_MS = 24 * HOUR_MS;
const TOAST_TITLE_MAX = 60;

export const SCRIPT_PROMPT_CALLBACK = /^sl:([0-9a-f-]{36}):(y|o|x|u|c):(\d)$/;

const callback = (promptId: string, action: 'y' | 'o' | 'x' | 'u' | 'c', index: number) =>
  `sl:${promptId}:${action}:${index}`;

function excerpt(text: string): string {
  const letters = Array.from(text.replace(/\s+/g, ' ').trim());
  return letters.length > EXCERPT ? `${letters.slice(0, EXCERPT - 1).join('')}…` : letters.join('');
}

function day(at: number, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(new Date(at));
}

/** The question about one candidate, with the buttons that answer it. */
export function askHtml(input: { title: string; scriptText: string; approvedAt: number; timezone: string }): string {
  return [
    '🔗 <b>Снят по этому сценарию?</b>',
    `Ролик: «${escapeHtml(input.title)}»`,
    `Сценарий, одобрен ${day(input.approvedAt, input.timezone)}:`,
    `<blockquote>${escapeHtml(excerpt(input.scriptText))}</blockquote>`
  ].join('\n');
}

export function askButtons(promptId: string, index: number) {
  return [
    [
      { text: '✅ Да', callbackData: callback(promptId, 'y', index) },
      { text: 'Другой', callbackData: callback(promptId, 'o', index) }
    ],
    [{ text: 'Без сценария', callbackData: callback(promptId, 'x', index) }]
  ];
}

/**
 * New videos of the last three days, one per title, to the ai module; then every open prompt of the last day
 * without its message gets one, so a message lost after its prompt was stored is raised again (review
 * 19.10.2026). Returns how many messages were raised.
 */
export async function raiseScriptPrompts(deps: {
  analytics: Pick<ContentAnalyticsRepository, 'listItems'>;
  alerts: Pick<ContentAlertRepository, 'insert' | 'existing'>;
  links: ScriptLinksRepository;
  clock: Clock;
  newId: () => string;
  timezone: string;
}): Promise<number> {
  const now = deps.clock.now();
  const items = (
    await Promise.all(
      (['youtube', 'tiktok'] as const).map((platform) =>
        deps.analytics.listItems({ platform, limit: RECENT_PER_PLATFORM })
      )
    )
  )
    .flat()
    .filter((item) => item.publishedAt >= now - RECENT_MS && item.publishedAt <= now);
  const videos = new Map<string, VideoForScript>();
  for (const item of items) {
    const key = scriptGroupKey(item.title);
    if (key === '') continue;
    const video = videos.get(key) ?? { groupKey: key, title: item.title, publishedAt: item.publishedAt, itemIds: [] };
    video.publishedAt = Math.min(video.publishedAt, item.publishedAt);
    video.itemIds.push(item.id);
    videos.set(key, video);
  }
  await proposeScriptLinks(
    { links: deps.links, clock: deps.clock, newId: deps.newId },
    [...videos.values()].sort((a, b) => a.publishedAt - b.publishedAt)
  );
  const open = await deps.links.openPrompts(now - MESSAGE_RETRY_MS, 2);
  const sent = await deps.alerts.existing(open.map((prompt) => `script:${prompt.id}`));
  const messages: NewContentAlert[] = [];
  for (const prompt of open) {
    if (sent.has(`script:${prompt.id}`)) continue;
    const revisionId = prompt.status === 'auto' ? prompt.revisionId : prompt.candidates[prompt.shown];
    const script = revisionId == null ? null : await deps.links.findScript(revisionId);
    if (script === null) continue;
    const base = {
      id: `script:${prompt.id}`,
      kind: 'item' as const,
      title: 'Сценарий ролика',
      body: prompt.title.slice(0, 2000),
      linkPath: `/analytics?id=${encodeURIComponent(prompt.itemIds[0] ?? '')}`
    };
    messages.push(
      prompt.status === 'asked'
        ? {
            ...base,
            html: askHtml({
              title: prompt.title,
              scriptText: script.text,
              approvedAt: script.approvedAt,
              timezone: deps.timezone
            }),
            buttons: askButtons(prompt.id, prompt.shown).flat()
          }
        : {
            ...base,
            html: [
              '🔗 <b>Привязал сценарий</b>',
              `Ролик: «${escapeHtml(prompt.title)}»`,
              `Сценарий, одобрен ${day(script.approvedAt, deps.timezone)}:`,
              `<blockquote>${escapeHtml(excerpt(script.text))}</blockquote>`
            ].join('\n'),
            buttons: [
              { text: '✅ Верно', callbackData: callback(prompt.id, 'c', 0) },
              { text: 'Не тот сценарий', callbackData: callback(prompt.id, 'u', 0) }
            ]
          }
    );
  }
  return deps.alerts.insert(messages, now);
}

export interface ScriptPromptReply {
  /** The callback's toast. */
  notice: string;
  /** The message's new text and buttons; null keeps the message as it is. */
  edit: { html: string; buttons: { text: string; callback_data: string }[][] } | null;
}

/** A tap on a prompt's button, turned into the toast and the message's new state. */
export async function handleScriptPromptTap(
  deps: { links: ScriptLinksRepository; clock: Clock; timezone: string },
  data: string
): Promise<ScriptPromptReply> {
  const match = SCRIPT_PROMPT_CALLBACK.exec(data);
  if (match === null) return { notice: 'Эта кнопка устарела.', edit: null };
  const [, promptId = '', code = '', index = '0'] = match;
  const action = ({ y: 'yes', o: 'other', x: 'none', u: 'undo', c: 'confirm' } as const)[
    code as 'y' | 'o' | 'x' | 'u' | 'c'
  ];
  const answer = await answerScriptPrompt(
    { links: deps.links, clock: deps.clock },
    { promptId, action, index: Number(index) }
  );
  const done = (text: string) => ({ notice: text, edit: { html: `🔗 ${escapeHtml(text)}`, buttons: [] } });
  switch (answer.kind) {
    case 'linked':
      return done(`Привязал «${Array.from(answer.title).slice(0, TOAST_TITLE_MAX).join('')}» к сценарию.`);
    case 'none':
      return done('Отметил: ролик без сценария.');
    case 'undone':
      return done('Отвязал. Ролик теперь без сценария.');
    case 'confirmed':
      return done(`Отметил: «${Array.from(answer.title).slice(0, TOAST_TITLE_MAX).join('')}» снят по этому сценарию.`);
    case 'no_more':
      return { notice: 'Других сценариев за две недели до ролика нет.', edit: null };
    case 'next':
      return {
        notice: 'Следующий кандидат',
        edit: {
          html: askHtml({
            title: answer.prompt.title,
            scriptText: answer.script.text,
            approvedAt: answer.script.approvedAt,
            timezone: deps.timezone
          }),
          buttons: askButtons(promptId, answer.index).map((row) =>
            row.map((button) => ({ text: button.text, callback_data: button.callbackData }))
          )
        }
      };
    default:
      return { notice: 'Эта кнопка устарела.', edit: null };
  }
}
