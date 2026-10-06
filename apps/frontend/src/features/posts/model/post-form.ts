import { POST_BODY_MAX, POST_TITLE_MAX } from '@alexeev/contracts';
import { z } from 'zod';
import { postsCopy } from '../ui/copy';

const copy = postsCopy.editor.validation;

// Same control-character rule as the contract (tabs and line breaks stay in the body); the server re-checks it.
const hasControl = (value: string, allowBreaks: boolean) =>
  // oxlint-disable-next-line no-control-regex
  (allowBreaks ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);

/** Client validation is UX only: the server validates again. The combined Telegram limit is a warning, not an error. */
export const postFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: copy.titleRequired })
    .max(POST_TITLE_MAX, { error: copy.titleTooLong(POST_TITLE_MAX) })
    .refine((value) => !hasControl(value, false), { error: copy.forbiddenChars }),
  body: z
    .string()
    .max(POST_BODY_MAX, { error: copy.bodyTooLong(POST_BODY_MAX) })
    .refine((value) => !hasControl(value, true), { error: copy.forbiddenChars })
});

export type PostFormValues = z.input<typeof postFormSchema>;
