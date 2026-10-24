import {
  normalizeEntities,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  postEntityListSchema,
  validatePostEntities
} from '@alexeev/contracts';
import { z } from 'zod';
import { postsCopy } from '../ui/copy';

const copy = postsCopy.editor.validation;

// Same control-character rule as the contract (tabs and line breaks stay in the body); the server re-checks it.
const hasControl = (value: string, allowBreaks: boolean) =>
  // oxlint-disable-next-line no-control-regex
  (allowBreaks ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);

/** Client validation is UX only: the server validates again. The combined Telegram limit is a warning, not an error. */
export const postFormSchema = z
  .object({
    // Empty for a post without a title (owner, 16.10.2026); an older titled post is checked by the server.
    title: z
      .string()
      .trim()
      .max(POST_TITLE_MAX, { error: copy.titleTooLong(POST_TITLE_MAX) })
      .refine((value) => !hasControl(value, false), { error: copy.forbiddenChars }),
    body: z
      .string()
      .max(POST_BODY_MAX, { error: copy.bodyTooLong(POST_BODY_MAX) })
      .refine((value) => !hasControl(value, true), { error: copy.forbiddenChars }),
    entities: postEntityListSchema
  })
  .superRefine((values, ctx) => {
    // Same check as the server's: a body and the entities that go with it (UX only, the server decides).
    const issue = validatePostEntities(values.body, normalizeEntities(values.entities));
    if (issue !== null) ctx.addIssue({ code: 'custom', path: ['body'], message: copy.entities[issue.code] });
  });

export type PostFormValues = z.input<typeof postFormSchema>;
