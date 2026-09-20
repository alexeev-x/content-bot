import { z } from 'zod';

export const textMessageSchema = z.object({
  chatId: z.number().int(),
  messageId: z.number().int().positive(),
  threadId: z.number().int().positive(),
  text: z.string().trim().min(1).max(20_000),
  section: z.object({ key: z.string(), title: z.string() }).optional(),
});

export type TextMessage = z.infer<typeof textMessageSchema>;
