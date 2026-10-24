import { type ContentContaminationReason, contentItemIdSchema } from '@alexeev/contracts';

// The bot button under a «перестал набирать / пропал» alert (docs/ai/architecture.md item 12): the owner's tap
// is the confirmation, the alert alone never is. callback_data holds at most 64 bytes: a prefix, a reason code
// and the item id.

const PREFIX = 'cc:';
const CALLBACK_LIMIT_BYTES = 64;
const CODES = { r: 'restricted', d: 'removed' } as const satisfies Record<string, ContentContaminationReason>;
type Code = keyof typeof CODES;
export type AlertContamination = (typeof CODES)[Code];

export const CONTAMINATION_CALLBACK = /^cc:[rd]:/;

/** The button's callback_data; null when the item id is too long to fit (the alert then goes without it). */
export function contaminationCallbackData(reason: AlertContamination, itemId: string): string | null {
  const code = (Object.keys(CODES) as Code[]).find((key) => CODES[key] === reason);
  const data = `${PREFIX}${code}:${itemId}`;
  return new TextEncoder().encode(data).length <= CALLBACK_LIMIT_BYTES ? data : null;
}

/** The reason and item of a tapped button; null for anything this module did not write. */
export function parseContaminationCallback(data: string): { reason: AlertContamination; itemId: string } | null {
  const match = /^cc:([rd]):(.+)$/.exec(data);
  if (match === null) return null;
  const itemId = contentItemIdSchema.safeParse(match[2]);
  return itemId.success ? { reason: CODES[match[1] as Code], itemId: itemId.data } : null;
}
