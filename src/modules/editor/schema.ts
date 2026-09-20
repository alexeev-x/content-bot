import { z } from 'zod';

export const textMessageSchema = z.object({
  chatId: z.number().int(),
  messageId: z.number().int().positive(),
  threadId: z.number().int().positive(),
  text: z.string().trim().min(1).max(20_000),
  section: z.object({ key: z.string(), title: z.string() }).optional(),
});

export type TextMessage = z.infer<typeof textMessageSchema>;

/** Модель предлагает одно действие; запись в D1 выполняется только после проверки. */
export const editorReplySchema = z.object({
  reply: z.string().trim().min(1).max(6000),
  action: z.enum(['reply', 'material', 'save_draft', 'save_example', 'remember', 'forget']),
  content: z.string().trim().min(1).max(12000).nullable(),
  rubricKey: z.string().max(100).nullable(),
  continuesMaterial: z.boolean(),
  evidence: z.string().trim().min(1).max(2000).nullable(),
  memoryId: z.string().max(100).nullable(),
});

export type EditorReply = z.infer<typeof editorReplySchema>;
export const editorReplyFormat = { name: 'editor_reply', schema: z.toJSONSchema(editorReplySchema) };
